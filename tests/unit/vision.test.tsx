import { readFileSync } from 'node:fs'
import type Anthropic from '@anthropic-ai/sdk'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAiClientForTests } from '../../src/lib/ai/aiClient'
import { readAssortmentPhoto, readBulkPhoto, readSinglePhoto } from '../../src/lib/ai/vision'
import { SEED_CATEGORIES } from '../../src/data/categories'
import { db } from '../../src/db'
import { saveSetup, setApiKey } from '../../src/lib/repo'

// jsdom has no canvas; photo compression is exercised in the browser tests instead.
vi.mock('../../src/lib/images', () => {
  const img = { dataUrl: 'data:image/jpeg;base64,AAAA', base64: 'AAAA', mediaType: 'image/jpeg', width: 1, height: 1 }
  return { makeVisionImage: async () => img, makeThumbnail: async () => img, compressImage: async () => img }
})

const fixture = (name: string): Anthropic.Message => JSON.parse(readFileSync(`tests/fixtures/vision-${name}.json`, 'utf8'))
const img = { dataUrl: '', base64: 'AAAA', mediaType: 'image/jpeg' as const, width: 1, height: 1 }

afterEach(() => setAiClientForTests(null))

describe('photo reading from recorded responses', () => {
  it('package: fills the form, and drops barcode digits whose check digit fails', async () => {
    setAiClientForTests({ createMessage: async () => fixture('package') })
    const r = await readSinglePhoto('package', img, SEED_CATEGORIES, 'standard')
    expect(r.supply.name).toMatch(/vinyl/i)
    expect(r.supply.category).toBe('adhesive-vinyl')
    expect(r.supply.quantity).toBe(6)
    // The model misread the printed barcode; a wrong UPC must never be cached.
    expect(r.supply.upc).toBeUndefined()
  })

  it('a barcode already scanned wins over anything read from the photo', async () => {
    setAiClientForTests({ createMessage: async () => fixture('package') })
    const r = await readSinglePhoto('package', img, SEED_CATEGORIES, 'standard', '036000291452')
    expect(r.supply.upc).toBe('036000291452')
  })

  it('loose item: always asks the user to check the quantity (spec 8.3)', async () => {
    setAiClientForTests({ createMessage: async () => fixture('loose') })
    const r = await readSinglePhoto('loose', img, SEED_CATEGORIES, 'standard')
    expect(r.uncertain.quantity).toBeTruthy()
  })

  it('bulk: one photo of 5 items gives 5 proposed supplies', async () => {
    setAiClientForTests({ createMessage: async () => fixture('bulk') })
    const items = await readBulkPhoto(img, SEED_CATEGORIES, 'standard')
    expect(items).toHaveLength(5)
    expect(items.map((i) => i.supply.category).sort()).toEqual(['blanks-drinkware', 'cardstock-paper', 'felt', 'iron-on', 'transfer-tape-mats'])
  })
})

describe('mixed-color pack photos', () => {
  const withReading = (reading: object): Anthropic.Message => {
    const base = fixture('mixed')
    return { ...base, content: [{ type: 'text', text: JSON.stringify(reading), citations: null }] as Anthropic.Message['content'] }
  }
  const reading = { name: 'Cardstock', setName: 'Mix', brand: 'X', category: 'cardstock-paper', subtype: '', dimensions: '', unit: 'sheet', upcDigits: '' }

  it('reads every printed color and count (recorded response)', async () => {
    setAiClientForTests({ createMessage: async () => fixture('mixed') })
    const r = await readAssortmentPhoto(img, SEED_CATEGORIES, 'standard')
    expect(r.colors.map((c) => c.color)).toEqual(['Cherry Pop', 'Sunbeam', 'Lagoon', 'Fern', 'Tangerine', 'Grape Soda', 'Bubblegum', 'Midnight'])
    expect(r.colors.every((c) => c.count === 5)).toBe(true)
    expect(r.countsConfident).toBe(true)
  })

  it('never keeps colors the model says it could not read', async () => {
    setAiClientForTests({ createMessage: async () => withReading({ ...reading, totalCount: 75, colors: [{ color: 'Rocket Red', count: 5 }], colorsReadable: false, countsConfident: true }) })
    const r = await readAssortmentPhoto(img, SEED_CATEGORIES, 'standard')
    expect(r.colors).toEqual([])
    expect(r.countsConfident).toBe(false)
  })

  it('flags counts that do not add up to the printed total, whatever the model claims', async () => {
    setAiClientForTests({ createMessage: async () => withReading({ ...reading, totalCount: 75, colors: [{ color: 'A', count: 5 }, { color: 'B', count: 5 }], colorsReadable: true, countsConfident: true }) })
    const r = await readAssortmentPhoto(img, SEED_CATEGORIES, 'standard')
    expect(r.colors).toHaveLength(2)
    expect(r.countsConfident).toBe(false)
  })
})

describe('bulk add screen (spec Phase 3 acceptance)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await saveSetup({ setupComplete: true })
    await setApiKey('sk-ant-test-key-0000000000000000000000')
  })

  it('shows an editable 5-row review list and saves all rows', async () => {
    setAiClientForTests({ createMessage: async () => fixture('bulk') })
    const { default: BulkAdd } = await import('../../src/screens/BulkAdd')
    const user = userEvent.setup()
    const { container } = render(
      <MemoryRouter>
        <BulkAdd />
      </MemoryRouter>,
    )
    const input = await waitFor(() => {
      const el = container.querySelector('input[type=file]')
      if (!el) throw new Error('screen still loading')
      return el as HTMLInputElement
    })
    await user.upload(input, new File(['x'], 'shelf.jpg', { type: 'image/jpeg' }))

    await screen.findByText(/We found 5 items/)
    for (let i = 1; i <= 5; i++) expect(screen.getByLabelText(`Name of item ${i}`)).toBeInTheDocument()

    // Edit one row and remove another, then save.
    const first = screen.getByLabelText('Name of item 1')
    await user.clear(first)
    await user.type(first, 'Gold glitter HTV')
    await user.click(screen.getByRole('button', { name: 'Remove item 5' }))
    await user.click(screen.getByRole('button', { name: /Save all 4/ }))

    await waitFor(async () => expect(await db.supplies.count()).toBe(4))
    expect(await db.supplies.where('name').equals('Gold glitter HTV').count()).toBe(1)
  })
})
