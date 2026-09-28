import { beforeEach, describe, expect, it } from 'vitest'
import { db, getMeta, setMeta } from '../../src/db'
import { BackupError, buildBackup, importBackup, markBackedUp, migrate, parseBackup, reminderState, type BackupFile } from '../../src/lib/backup'
import { saveProject, saveSetup, saveSupply, setApiKey } from '../../src/lib/repo'
import { BACKUP_SCHEMA_VERSION } from '../../src/config'

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

beforeEach(clearAll)

describe('backup round trip (spec Phase 1 acceptance)', () => {
  it('export → wipe → import restores everything, including thumbnails', async () => {
    await saveSetup({ machineId: 'cricut-maker-5', ownedToolIds: ['fine-point-cutting-tool'], setupComplete: true })
    for (let i = 0; i < 20; i++) {
      await saveSupply({ name: `Supply ${i}`, category: 'cardstock-paper', quantity: i, unit: 'sheet', source: 'manual', thumbnail: i === 0 ? 'data:image/jpeg;base64,/9j/AAAA' : undefined })
    }
    await saveProject({ title: 'P', summary: '', goal: 'decor', goalContext: {}, status: 'idea', uses: [], missing: [], toolsNeeded: [], equipmentNeeded: [], steps: [], designTips: '', safetyNotes: [], aiGenerated: false })
    await db.upcCache.put({ upc: '012345678905', proposedSupply: { name: 'x' }, confirmedAt: 'now', timesUsed: 1 })
    await setApiKey('sk-ant-secret-key-that-must-not-leak-000000')

    const json = JSON.stringify(await buildBackup())
    expect(json).not.toContain('sk-ant-secret')

    await clearAll()
    expect(await db.supplies.count()).toBe(0)

    await importBackup(parseBackup(json), 'replace')
    expect(await db.supplies.count()).toBe(20)
    expect((await db.supplies.where('name').equals('Supply 0').first())!.thumbnail).toBe('data:image/jpeg;base64,/9j/AAAA')
    expect((await db.setup.get('setup'))!.setupComplete).toBe(true)
    expect(await db.projects.count()).toBe(1)
    expect(await db.upcCache.count()).toBe(1)
    expect(await db.secrets.count()).toBe(0)
  })

  it('merge keeps local records and takes the newer copy of shared ones', async () => {
    const a = await saveSupply({ name: 'Old name', category: 'felt', quantity: 1, unit: 'sheet', source: 'manual' })
    const backup = await buildBackup()
    ;(backup.data.supplies as { id: string; name: string; updatedAt: string }[])[0].name = 'From backup'
    ;(backup.data.supplies as { updatedAt: string }[])[0].updatedAt = '2000-01-01T00:00:00.000Z' // older
    backup.data.supplies!.push({ ...(backup.data.supplies![0] as object), id: 'other', name: 'Only in backup', updatedAt: '2030-01-01T00:00:00.000Z' })
    await saveSupply({ id: 'local-only', name: 'Only here', category: 'felt', quantity: 1, unit: 'sheet', source: 'manual' })

    await importBackup(backup, 'merge')
    expect((await db.supplies.get(a.id))!.name).toBe('Old name')
    expect((await db.supplies.get('other'))!.name).toBe('Only in backup')
    expect(await db.supplies.get('local-only')).toBeTruthy()
  })

  it('merge does not double-count usage history', async () => {
    await db.usageLog.add({ timestamp: '2026-09-01T00:00:00Z', feature: 'recommend', model: 'claude-sonnet-5', inputTokens: 1, outputTokens: 1 })
    const backup = await buildBackup()
    await importBackup(backup, 'merge')
    expect(await db.usageLog.count()).toBe(1)
  })
})

describe('schema versions', () => {
  it('rejects files that are not CraftCue backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(BackupError)
    expect(() => parseBackup('not json')).toThrow(BackupError)
  })

  it('rejects backups from a newer app version', () => {
    const b = { app: 'craftcue', schemaVersion: BACKUP_SCHEMA_VERSION + 1, appVersion: '9', exportedAt: '', data: {} }
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/newer version/)
  })

  it('migrates old backups forward step by step', () => {
    const v1: BackupFile = { app: 'craftcue', schemaVersion: 1, appVersion: '0.1.0', exportedAt: '', data: { supplies: [{ id: 'a', qty: 3 }] } }
    const migrations = {
      1: (b: BackupFile): BackupFile => ({ ...b, schemaVersion: 2, data: { ...b.data, supplies: (b.data.supplies as { id: string; qty: number }[]).map(({ qty, ...s }) => ({ ...s, quantity: qty })) } }),
      2: (b: BackupFile): BackupFile => ({ ...b, schemaVersion: 3, data: { ...b.data, people: [] } }),
    }
    const out = migrate(v1, 3, migrations)
    expect(out.schemaVersion).toBe(3)
    expect(out.data.supplies).toEqual([{ id: 'a', quantity: 3 }])
    expect(out.data.people).toEqual([])
    expect(() => migrate(v1, 4, migrations)).toThrow(BackupError)
  })
})

describe('backup reminder', () => {
  const settings = { enabled: true, afterChanges: 50, afterDays: 14 }

  it('fires after N changes', async () => {
    await setMeta('firstUseAt', new Date().toISOString())
    await setMeta('changesSinceBackup', 49)
    expect((await reminderState(settings)).due).toBe(false)
    await setMeta('changesSinceBackup', 50)
    expect((await reminderState(settings)).due).toBe(true)
  })

  it('fires after N days with at least one change, and resets on backup', async () => {
    const now = Date.parse('2026-09-28T00:00:00Z')
    await setMeta('firstUseAt', '2026-09-01T00:00:00Z')
    await setMeta('changesSinceBackup', 1)
    expect((await reminderState(settings, now)).due).toBe(true)
    await markBackedUp()
    expect(await getMeta('changesSinceBackup', -1)).toBe(0)
    expect((await reminderState(settings)).due).toBe(false)
  })

  it('counts user edits', async () => {
    await saveSupply({ name: 'x', category: 'felt', quantity: 1, unit: 'sheet', source: 'manual' })
    expect(await getMeta('changesSinceBackup', 0)).toBe(1)
  })
})

describe('setup saves', () => {
  it('rapid concurrent patches do not overwrite each other', async () => {
    const { saveSetup: save, getSetup } = await import('../../src/lib/repo')
    await Promise.all([save({ skillLevel: 'experienced' }), save({ equipment: ['heat-press'] }), save({ fontScale: 1.3 })])
    const s = await getSetup()
    expect(s.skillLevel).toBe('experienced')
    expect(s.equipment).toEqual(['heat-press'])
    expect(s.fontScale).toBe(1.3)
  })
})
