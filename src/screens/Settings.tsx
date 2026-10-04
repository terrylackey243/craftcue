import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { db, getMeta } from '../db'
import { useAccount, useApiKey, useColorList, useSecret, useSetupEditor } from '../hooks'
import { ColorSwatch } from '../components/ColorPick'
import { addColor, DEFAULT_COLORS, removeColor, renameColor, setColorShade, type ColorEntry } from '../lib/colorList'
import AccountForm from '../components/AccountForm'
import { cloudEnabled } from '../lib/cloud/config'
import { authMethod, changePassword, deleteAccount, signOut, signupOpen, syncNow } from '../lib/cloud/account'
import { APP_VERSION, REPO_URL, SUPPORT_URL } from '../config'
import { BackupError, exportBackup, importBackup, parseBackup, type BackupFile } from '../lib/backup'
import { forgetApiKey, forgetSecret, maskKey, resetEverything, setSecret } from '../lib/repo'
import { formatBytes, requestPersistence, storageStatus, type StorageStatus } from '../lib/storage'
import { summarizeMonth } from '../lib/ai/models'
import { cacheToSeed, PROVIDERS } from '../lib/upc'
import { effectiveMachine, machineLabel } from '../data'
import { AboutYou, EquipmentPicker, MachinePicker, ToolsPicker } from '../components/SetupSections'
import KeyForm from '../components/KeyForm'
import { Button, Chip, Notice, PageHeader, Sheet, Spinner, fieldClass, inputClass } from '../components/ui'
import type { UserSetup } from '../types'
import imageModels from '../data/imageModels.json'

function Section({ title, summary, children, defaultOpen = false, id }: { title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; id?: string }) {
  return (
    <details id={id} className="group rounded-2xl bg-white ring-1 ring-stone-200" open={defaultOpen}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span>
          <span className="block text-lg font-bold">{title}</span>
          {summary && <span className="block text-sm text-stone-600">{summary}</span>}
        </span>
        <span aria-hidden className="text-2xl text-stone-400 transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-stone-100 p-4">{children}</div>
    </details>
  )
}

export default function Settings() {
  const [setup, patch] = useSetupEditor()
  useEffect(() => {
    const target = ['account', 'extras'].find((id) => window.location.hash.endsWith(`#${id}`))
    const el = target ? document.getElementById(target) : null
    if (setup && el) {
      if (el instanceof HTMLDetailsElement) el.open = true
      el.scrollIntoView?.()
    }
  }, [setup])
  if (!setup) return <Spinner />
  const m = effectiveMachine(setup)

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Settings" />
      {cloudEnabled && <AccountSection />}
      <Section title="Machine & tools" summary={`${m ? machineLabel(m) : 'No machine'} · ${setup.ownedToolIds.length} tools`}>
        <div className="flex flex-col gap-6">
          <MachinePicker setup={setup} patch={patch} />
          <div>
            <h3 className="mb-2 text-lg font-bold">Tools you own</h3>
            <ToolsPicker setup={setup} patch={patch} />
          </div>
        </div>
      </Section>
      <Section title="Other equipment" summary={setup.equipment.length ? `${setup.equipment.length} selected` : 'None selected'}>
        <EquipmentPicker setup={setup} patch={patch} />
      </Section>
      <Section title="About you" summary={`Skill: ${setup.skillLevel}`}>
        <AboutYou setup={setup} patch={patch} />
      </Section>
      <AiSection setup={setup} patch={patch} />
      <ExtrasSection />
      <ColorsSection />
      <Section title="People" summary="Gift recipients">
        <Link to="/people" className="font-semibold text-brand-700 underline">
          Manage the people you make gifts for →
        </Link>
      </Section>
      <BackupSection setup={setup} patch={patch} />
      <BarcodeSection setup={setup} patch={patch} />
      <Section title="Text size" summary={`${Math.round(setup.fontScale * 100)}%`}>
        <div className="flex flex-wrap gap-2">
          {[0.9, 1, 1.15, 1.3, 1.5].map((s) => (
            <Chip key={s} selected={setup.fontScale === s} onClick={() => patch({ fontScale: s })}>
              {s === 1 ? 'Normal' : `${Math.round(s * 100)}%`}
            </Chip>
          ))}
        </div>
      </Section>
      <ResetSection />
      <AboutSection />
    </div>
  )
}

function AiSection({ setup, patch }: { setup: UserSetup; patch: (p: Partial<UserSetup>) => void }) {
  const key = useApiKey()
  const usage = useLiveQuery(() => db.usage.toArray(), []) ?? []
  const month = summarizeMonth(usage)
  const [test, setTest] = useState<{ busy: boolean; msg?: string; ok?: boolean }>({ busy: false })

  return (
    <Section title="Smart suggestions (AI)" summary={key ? `On · key ${maskKey(key)}` : 'Not set up'}>
      <div className="flex flex-col gap-4">
        {key ? (
          <>
            <p>
              Your key: <code className="rounded bg-stone-100 px-2 py-1">{maskKey(key)}</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={test.busy}
                onClick={async () => {
                  setTest({ busy: true })
                  const { testKey } = await import('../lib/ai/testKey')
                  const r = await testKey(key)
                  setTest({ busy: false, ok: r.ok, msg: r.ok ? 'Your key works.' : r.error.message })
                }}
              >
                Test key
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (window.confirm('Forget your key? Smart features will stop until you add a key again.')) {
                    await forgetApiKey()
                    patch({ aiEnabled: false })
                  }
                }}
              >
                Forget my key
              </Button>
            </div>
            {test.busy && <Spinner label="Testing…" />}
            {test.msg && <Notice tone={test.ok ? 'success' : 'error'}>{test.msg}</Notice>}
          </>
        ) : (
          <KeyForm />
        )}

        <fieldset>
          <legend className="mb-2 font-semibold">Quality</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={setup.quality === 'standard'} onClick={() => patch({ quality: 'standard' })}>
              Standard (cheaper)
            </Chip>
            <Chip selected={setup.quality === 'best'} onClick={() => patch({ quality: 'best' })}>
              Best (costs more)
            </Chip>
          </div>
        </fieldset>

        <div className="rounded-xl bg-stone-50 p-3">
          <p className="font-semibold">This month</p>
          <p>
            {month.suggestions} round{month.suggestions === 1 ? '' : 's'} of suggestions, {month.designs} design{month.designs === 1 ? '' : 's'}, {month.photoScans} photo scan{month.photoScans === 1 ? '' : 's'}
            {month.images ? `, ${month.images} illustration${month.images === 1 ? '' : 's'}` : ''}, about{' '}
            <strong>${month.dollars.toFixed(2)}</strong>
          </p>
          <p className="text-sm text-stone-600">An estimate from list prices. Your Anthropic, OpenAI and Recraft accounts show the exact amounts.</p>
        </div>
        <Link to="/help/ai-key" className="font-semibold text-brand-700 underline">
          How to get a key, and what it costs →
        </Link>
      </div>
    </Section>
  )
}

/** The crafter's own color names: plain and expanded colors (never brand names), editable. */
function ColorsSection() {
  const [list, save] = useColorList()
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState('')
  const [newHex, setNewHex] = useState<string | undefined>()
  const custom = list !== DEFAULT_COLORS
  // ~900 colors: show the crafter's own (added or taught) until they search.
  const standard = new Map(DEFAULT_COLORS.map((e) => [e.name, e.hexes.join()]))
  const mine = list.filter((e) => standard.get(e.name) !== e.hexes.join())
  const term = q.trim().toLowerCase()
  const matches = term ? list.filter((e) => e.name.toLowerCase().includes(term)) : mine
  const shown = matches.slice(0, 60)
  return (
    <Section id="colors" title="Color names" summary={`${list.length} colors${custom ? ' (your list)' : ''}`}>
      <div className="flex flex-col gap-4">
        <p>
          Picked colors are named after the closest color here, like Scarlet, Sand, Navy or Light peach. The list starts with the names people most often give colors (from the xkcd color survey). Brand names (Rocket Red, Astro White) aren't colors, so they don't belong here. When a picked
          shade isn't close to any of these, CraftCue asks you to add it or say which color it is.
        </p>
        <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
          <p className="font-semibold">Add a color</p>
          <div className="flex flex-wrap items-center gap-2">
            <ColorSwatch label={newName || 'the new color'} value={newHex} onChange={setNewHex} />
            <label className="sr-only" htmlFor="add-color-name">
              New color name
            </label>
            <input id="add-color-name" className={`${fieldClass} w-48`} placeholder="e.g. Mint" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button
              variant="secondary"
              disabled={!newName.trim() || !newHex}
              onClick={async () => {
                await save(addColor(list, newName, newHex!))
                setNewName('')
                setNewHex(undefined)
              }}
            >
              Add
            </Button>
          </div>
          <p className="text-sm text-stone-600">Pick its swatch with 💧, then name it.</p>
        </div>
        <div>
          <label className="sr-only" htmlFor="color-search">
            Find a color
          </label>
          <input id="color-search" type="search" className={inputClass} placeholder="🔍 Find a color" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="text-sm text-stone-600">
          {term
            ? `${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length > shown.length ? `, showing the first ${shown.length}` : ''}.`
            : mine.length
              ? `Colors you added or taught (${mine.length}). Search to see any of the ${list.length}.`
              : `Search to see any of the ${list.length} colors. Colors you add or teach will show here.`}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((e) => (
            <ColorNameRow key={e.name} entry={e} onRename={(to) => void save(renameColor(list, e.name, to))} onShade={(hex) => void save(setColorShade(list, e.name, hex))} onRemove={() => void save(removeColor(list, e.name))} />
          ))}
        </ul>
        {custom && (
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => {
              if (window.confirm('Go back to the standard color list? Colors you added and shades CraftCue learned will be removed.')) void save([])
            }}
          >
            Reset to the standard list
          </Button>
        )}
      </div>
    </Section>
  )
}

function ColorNameRow({ entry, onRename, onShade, onRemove }: { entry: ColorEntry; onRename: (to: string) => void; onShade: (hex: string) => void; onRemove: () => void }) {
  const [name, setName] = useState(entry.name)
  const id = `cn-${entry.name.replace(/\W+/g, '-')}`
  return (
    <li className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-stone-200">
      <ColorSwatch label={entry.name} value={entry.hexes[0]} onChange={(hex) => hex && onShade(hex)} />
      <label className="sr-only" htmlFor={id}>
        Name for {entry.name}
      </label>
      <input
        id={id}
        className={`${fieldClass} min-w-0 flex-1`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => (name.trim() && name.trim() !== entry.name ? onRename(name) : setName(entry.name))}
      />
      {entry.hexes.length > 1 && <span className="text-xs text-stone-500" title="Shades CraftCue learned for this color">+{entry.hexes.length - 1}</span>}
      <button type="button" aria-label={`Remove ${entry.name}`} className="min-h-11 min-w-11 rounded-full text-xl text-stone-500 hover:bg-stone-100" onClick={onRemove}>
        ×
      </button>
    </li>
  )
}

function ExtrasSection() {
  const openai = useSecret('openaiApiKey')
  const recraft = useSecret('recraftApiKey')
  const on = [openai && 'stickers', recraft && 'vinyl art'].filter(Boolean)
  return (
    <Section id="extras" title="Extra abilities (optional)" summary={on.length ? `On: ${on.join(', ')}` : 'Illustrated stickers and vinyl art'}>
      <div className="flex flex-col gap-6">
        <p>
          These are optional. Each one uses a separate account with its own key and its own small charges. Turn on the ones you want; everything else in CraftCue works
          without them. Your keys stay on this device and never sync or go into backups.
        </p>
        <AddonKey
          name="Illustrated stickers"
          secret="openaiApiKey"
          saved={openai}
          provider="OpenAI"
          what="Paints full-color sticker art with a see-through background. CraftCue adds a white edge and lays them out on a sheet for Print Then Cut."
          cost={`About ${Math.round(imageModels.openai.estUsdPerImage * 100)} cents per picture.`}
          placeholder="sk-…"
          test={async (k) => (await import('../lib/addons/openaiImages')).testOpenAiKey(k)}
          steps={[
            'Go to platform.openai.com and sign in or create an account.',
            'Open Settings, then Billing, and add a little credit (for example $5).',
            'Open API keys, choose Create new secret key, and copy it.',
            'Paste it below. If OpenAI says your organization must be verified, follow its steps under Settings, then Organization; it can take a few minutes.',
          ]}
        />
        <AddonKey
          name="Illustrated vinyl art"
          secret="recraftApiKey"
          saved={recraft}
          provider="Recraft"
          what="Draws a flat illustration in only the vinyl colors you pick. CraftCue turns each color into its own cut layer with a mock-up and a Design Space file."
          cost={`About ${Math.round(imageModels.recraft.estUsdPerImage * 100)} cents per design.`}
          placeholder="Your Recraft API key"
          test={async (k) => {
            const r = await (await import('../lib/addons/recraft')).testRecraftKey(k)
            return r.error
          }}
          steps={[
            'Go to recraft.ai and sign in or create an account.',
            'Open your profile menu and choose API.',
            'Buy some API units (the smallest pack is plenty to start).',
            'Create an API key, copy it, and paste it below.',
          ]}
        />
        <p className="text-sm text-stone-600">
          When you use these, the description you write goes straight from this device to OpenAI or Recraft. Nothing from your stash is sent except the colors you pick.
        </p>
      </div>
    </Section>
  )
}

function AddonKey({
  name,
  secret,
  saved,
  provider,
  what,
  cost,
  placeholder,
  steps,
  test,
}: {
  name: string
  secret: 'openaiApiKey' | 'recraftApiKey'
  saved: string | undefined
  provider: string
  what: string
  cost: string
  placeholder: string
  steps: string[]
  test: (key: string) => Promise<string | null>
}) {
  const [key, setKey] = useState('')
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; msg?: string }>({ busy: false })
  const check = async (k: string, save: boolean) => {
    setState({ busy: true })
    const error = await test(k.trim())
    if (!error && save) {
      await setSecret(secret, k)
      setKey('')
    }
    setState({ busy: false, ok: !error, msg: error ?? (save ? `It works! ${name} are turned on.` : 'Your key works.') })
  }
  const inputId = `key-${secret}`
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-stone-50 p-4">
      <h3 className="text-lg font-bold">
        {name} <span className="font-normal text-stone-600">with {provider}</span>
      </h3>
      <p>{what}</p>
      <p className="text-sm text-stone-600">{cost}</p>
      {saved ? (
        <>
          <p>
            Your key: <code className="rounded bg-white px-2 py-1">{maskKey(saved)}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={state.busy} onClick={() => void check(saved, false)}>
              Test key
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (window.confirm(`Forget your ${provider} key? ${name} will stop until you add it again.`)) {
                  await forgetSecret(secret)
                  setState({ busy: false })
                }
              }}
            >
              Forget key
            </Button>
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (key.trim()) void check(key, true)
          }}
        >
          <details>
            <summary className="cursor-pointer font-semibold text-brand-700">How to get a {provider} key</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-6">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </details>
          <label htmlFor={inputId} className="font-semibold">
            Paste your {provider} key
          </label>
          <input id={inputId} type="password" autoComplete="off" spellCheck={false} className={inputClass} placeholder={placeholder} value={key} onChange={(e) => setKey(e.target.value)} />
          <Button type="submit" className="self-start" disabled={!key.trim() || state.busy}>
            Test and save key
          </Button>
        </form>
      )}
      {state.busy && <Spinner label={`Checking with ${provider}…`} />}
      {state.msg && <Notice tone={state.ok ? 'success' : 'error'}>{state.msg}</Notice>}
    </div>
  )
}

function BackupSection({ setup, patch }: { setup: UserSetup; patch: (p: Partial<UserSetup>) => void }) {
  const lastBackupAt = useLiveQuery(() => getMeta<string | null>('lastBackupAt', null), [])
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [pending, setPending] = useState<BackupFile | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void storageStatus().then(setStatus)
  }, [])

  const r = setup.backupReminder

  return (
    <Section title="Backup & restore" summary={lastBackupAt ? `Last backup ${new Date(lastBackupAt).toLocaleDateString()}` : 'No backup yet'} defaultOpen={!lastBackupAt}>
      <div className="flex flex-col gap-4">
        <p>Your stash lives only in this browser. A backup file keeps it safe, and lets you move it to another device.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              setMsg(null)
              try {
                const how = await exportBackup()
                setMsg({ tone: 'success', text: how === 'shared' ? 'Backup ready. Save it to Files, iCloud Drive or email it to yourself.' : 'Backup downloaded. Keep the file somewhere safe.' })
              } catch (e) {
                setMsg({ tone: 'error', text: (e as Error).message })
              }
            }}
          >
            💾 Save a backup
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            📂 Restore from a backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="Choose a backup file"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                setPending(parseBackup(await f.text()))
              } catch (err) {
                setMsg({ tone: 'error', text: err instanceof BackupError ? err.message : "Couldn't read that file." })
              }
            }}
          />
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

        <div className="rounded-xl bg-stone-50 p-3">
          <p className="font-semibold">Storage</p>
          {status === null ? (
            <Spinner />
          ) : status.persisted ? (
            <p>✅ Your browser has agreed to keep your data.</p>
          ) : (
            <>
              <p>⚠ Your browser may clear data if space is low — keep backups.</p>
              <Button
                variant="ghost"
                onClick={async () => {
                  await requestPersistence()
                  setStatus(await storageStatus())
                }}
              >
                Ask the browser again
              </Button>
            </>
          )}
          {status?.usageBytes !== undefined && <p className="text-sm text-stone-600">Using {formatBytes(status.usageBytes)} on this device.</p>}
          <p className="mt-1 text-sm text-stone-600">On iPhone and iPad, adding CraftCue to your Home Screen makes it much less likely your data gets cleared.</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">Backup reminder</legend>
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" className="h-6 w-6 accent-brand-600" checked={r.enabled} onChange={(e) => patch({ backupReminder: { ...r, enabled: e.target.checked } })} />
            Remind me to back up
          </label>
          {r.enabled && (
            <div className="flex flex-wrap items-center gap-2">
              after
              <label className="sr-only" htmlFor="rc">
                changes
              </label>
              <input id="rc" inputMode="numeric" className={`${fieldClass} w-20`} value={r.afterChanges} onChange={(e) => patch({ backupReminder: { ...r, afterChanges: Math.max(1, Number(e.target.value) || 1) } })} />
              changes or
              <label className="sr-only" htmlFor="rd">
                days
              </label>
              <input id="rd" inputMode="numeric" className={`${fieldClass} w-20`} value={r.afterDays} onChange={(e) => patch({ backupReminder: { ...r, afterDays: Math.max(1, Number(e.target.value) || 1) } })} />
              days
            </div>
          )}
        </fieldset>
      </div>

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Restore this backup?">
        {pending && (
          <div className="flex flex-col gap-4">
            <p>
              From {new Date(pending.exportedAt).toLocaleString()}: {pending.data.supplies?.length ?? 0} supplies, {pending.data.projects?.length ?? 0} projects,{' '}
              {pending.data.people?.length ?? 0} people.
            </p>
            <Button
              onClick={async () => {
                await importBackup(pending, 'merge')
                setPending(null)
                setMsg({ tone: 'success', text: 'Backup added to what you already had.' })
              }}
            >
              Add to what I have (merge)
            </Button>
            <p className="-mt-2 text-sm text-stone-600">Keeps everything here, and adds anything from the backup. If the same item is in both, the newer one wins.</p>
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm('Replace everything on this device with the backup? Anything not in the backup will be lost.')) return
                await importBackup(pending, 'replace')
                setPending(null)
                setMsg({ tone: 'success', text: 'Everything has been restored from the backup.' })
              }}
            >
              Replace everything with the backup
            </Button>
          </div>
        )}
      </Sheet>
    </Section>
  )
}

function BarcodeSection({ setup, patch }: { setup: UserSetup; patch: (p: Partial<UserSetup>) => void }) {
  const count = useLiveQuery(() => db.upcCache.count(), []) ?? 0
  return (
    <Section title="Barcodes" summary={`${count} remembered`}>
      <div className="flex flex-col gap-4">
        <p>Every barcode you scan and confirm is remembered on this device, so the next scan is instant and works offline.</p>
        <label className="flex min-h-12 items-center gap-3">
          <input
            type="checkbox"
            className="h-6 w-6 accent-brand-600"
            disabled={PROVIDERS.length === 0}
            checked={setup.upcLookupEnabled && PROVIDERS.length > 0}
            onChange={(e) => patch({ upcLookupEnabled: e.target.checked })}
          />
          Look up unknown barcodes online
        </label>
        {PROVIDERS.length === 0 && <p className="-mt-3 text-sm text-stone-600">Not available yet: no free barcode service works directly from a browser. Unknown barcodes use a photo instead.</p>}
        <Button
          variant="secondary"
          disabled={count === 0}
          className="self-start"
          onClick={async () => {
            const entries = cacheToSeed(await db.upcCache.toArray())
            const blob = new Blob([JSON.stringify({ entries }, null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'craftcue-upc-seed-entries.json'
            a.click()
            setTimeout(() => URL.revokeObjectURL(a.href), 5000)
          }}
        >
          Share my barcodes with the project
        </Button>
        <p className="-mt-2 text-sm text-stone-600">
          Downloads your remembered barcodes (product details only: no quantities, costs or locations) so they can be added to CraftCue for everyone. See the
          project page on GitHub for how to send them.
        </p>
      </div>
    </Section>
  )
}

function ResetSection() {
  const [typed, setTyped] = useState('')
  return (
    <Section title="Reset the app">
      <div className="flex flex-col gap-3">
        <p>This deletes everything on this device: your stash, projects, people, settings and AI key. Save a backup first if you might want it back.</p>
        <label htmlFor="reset" className="font-semibold">
          Type DELETE to confirm
        </label>
        <input id="reset" className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <Button
          variant="danger"
          disabled={typed.trim().toUpperCase() !== 'DELETE'}
          onClick={async () => {
            await resetEverything()
            window.location.hash = '#/setup'
            window.location.reload()
          }}
        >
          Delete everything
        </Button>
      </div>
    </Section>
  )
}

function AboutSection() {
  return (
    <Section title="About CraftCue" summary={`Version ${APP_VERSION}`}>
      <div className="flex flex-col gap-3">
        <p>CraftCue is free, open-source software (MIT license). It has no accounts, no tracking and no ads. Your data stays in this browser.</p>
        <p className="rounded-xl bg-stone-50 p-3 text-sm">
          CraftCue is not affiliated with or endorsed by Cricut, Silhouette, Brother or Anthropic. Brand and machine names are used only to describe
          compatibility.
        </p>
        <p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
            Source code, license and third-party licenses on GitHub
          </a>
        </p>
        <p className="text-sm text-stone-600">
          Designs use open-license fonts (SIL Open Font License and Apache 2.0: Bebas Neue, Anton, Alfa Slab One, Abril Fatface, Luckiest Guy, Chewy, Sniglet, Rye,
          Lobster, Pacifico, Oleo Script, Cookie) and Phosphor Icons (MIT). Their licenses are included with the app in the licenses folder.
        </p>
        {SUPPORT_URL && (
          <p>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
              ☕ Support CraftCue
            </a>
          </p>
        )}
      </div>
    </Section>
  )
}

function AccountSection() {
  const a = useAccount()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'warn'; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const when = a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString() : 'not yet'
  const summary = a.userId ? `Signed in as ${a.email}` : 'Not signed in: your stash is only on this device'

  return (
    <Section id="account" title="Your account" summary={summary} defaultOpen>
      {!a.userId ? (
        <div className="flex flex-col gap-3">
          <p>{signupOpen ? 'Create a free account' : 'Sign in'} to keep your stash safe and see it on all your devices. Everything already on this device comes with you.</p>
          <AccountForm onDone={() => setMsg({ tone: 'success', text: 'Signed in. Your stash is syncing.' })} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-stone-50 p-3">
            <p>
              Signed in as <strong>{a.email}</strong>
            </p>
            <p className="text-sm text-stone-600">
              Last synced: {when}
              {a.pending > 0 && ` · ${a.pending} change${a.pending === 1 ? '' : 's'} waiting to sync`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={a.sync === 'syncing'} onClick={() => void syncNow()}>
              🔄 Sync now
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const warn = a.pending > 0 ? `\n\n${a.pending} change(s) haven't synced yet and will be lost.` : ''
                if (!window.confirm(`Sign out? Your stash stays safe in your account and is removed from this device.${warn}`)) return
                setBusy(true)
                await signOut()
                setBusy(false)
              }}
            >
              Sign out
            </Button>
          </div>
          {authMethod === 'password' && (
            <details className="rounded-xl bg-stone-50 p-3">
              <summary className="cursor-pointer font-semibold">Change my password</summary>
              <form
                className="mt-3 flex flex-col gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  setBusy(true)
                  const err = await changePassword(newPassword)
                  setBusy(false)
                  if (!err) setNewPassword('')
                  setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: 'Your password has been changed.' })
                }}
              >
                <label htmlFor="new-pw" className="font-semibold">
                  New password
                </label>
                <input id="new-pw" type="password" autoComplete="new-password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <Button type="submit" variant="secondary" disabled={busy || newPassword.length < 8} className="self-start">
                  Change password
                </Button>
              </form>
            </details>
          )}
          <details className="rounded-xl bg-red-50 p-3">
            <summary className="cursor-pointer font-semibold text-red-800">Delete my account</summary>
            <div className="mt-3 flex flex-col gap-2">
              <p>This permanently deletes your account and everything in it, from every device. Save a backup first if you might want it back.</p>
              <label htmlFor="del-acct" className="font-semibold">
                Type DELETE to confirm
              </label>
              <input id="del-acct" className={inputClass} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} autoComplete="off" />
              <Button
                variant="danger"
                disabled={busy || confirmDelete.trim().toUpperCase() !== 'DELETE'}
                onClick={async () => {
                  setBusy(true)
                  const err = await deleteAccount()
                  setBusy(false)
                  setMsg(err ? { tone: 'error', text: err } : { tone: 'success', text: 'Your account and its data have been deleted.' })
                }}
              >
                Delete my account and data
              </Button>
            </div>
          </details>
        </div>
      )}
      {msg && (
        <div className="mt-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
    </Section>
  )
}
