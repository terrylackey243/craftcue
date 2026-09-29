import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DesignView from '../../src/components/DesignView'
import { db } from '../../src/db'
import { guessHex } from '../../src/lib/colorGuess'
import { makeStickerArt, testOpenAiKey } from '../../src/lib/addons/openaiImages'
import { makeVectorArt, testRecraftKey } from '../../src/lib/addons/recraft'
import { layoutSheet } from '../../src/lib/addons/stickers'
import { buildVectorDesign } from '../../src/lib/addons/vectorDesign'
import { checkDesign } from '../../src/lib/design/checks'
import { exportSvg } from '../../src/lib/design/export'
import { renderDesign } from '../../src/lib/design/render'
import { saveProject, saveSetup, saveSupply, setSecret } from '../../src/lib/repo'
import type { Supply } from '../../src/types'

// A cat face: white background, black head with white eyes, an orange nose.
const CAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#fff"/>
  <circle cx="50" cy="55" r="35" fill="#151515"/>
  <circle cx="38" cy="47" r="6" fill="#fff"/><circle cx="62" cy="47" r="6" fill="#fff"/>
  <path d="M45 61 L55 61 L50 67 Z" fill="#f08a2c"/>
</svg>`
const b64 = (s: string) => btoa(s)

const vinyl = (id: string, color: string): Supply => ({
  id, name: 'Permanent vinyl', color, category: 'adhesive-vinyl', quantity: 2, unit: 'sheet', dimensions: '12 x 12 in', createdAt: '', updatedAt: '',
}) as Supply

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await saveSetup({ setupComplete: true, machineId: 'cricut-maker-5' })
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('color guesses', () => {
  it('reads craft color names, most specific first', () => {
    expect(guessHex('Rose Gold')).toBe('#b76e79')
    expect(guessHex('Rocket Red')).toBe('#c62828')
    expect(guessHex('Sour Apple')).toBe('#9acd32')
    expect(guessHex('Mystery')).toBe('#888888')
  })
})

describe('sticker sheet layout', () => {
  it('fits stickers inside the Print Then Cut area', () => {
    const slots = layoutSheet(2)
    expect(slots).toHaveLength(12) // 4 across × 3 down on 9.25 × 6.75 in
    for (const s of slots) {
      expect(s.x + 2).toBeLessThanOrEqual(9.25)
      expect(s.y + 2).toBeLessThanOrEqual(6.75)
    }
    expect(layoutSheet(7)).toHaveLength(0)
  })
})

describe('vector artwork as a design', () => {
  it('becomes one cut layer per chosen color that draws, checks and exports', async () => {
    const black = vinyl('v-black', 'Black')
    const orange = vinyl('v-orange', 'Orange')
    const design = buildVectorDesign(CAT, [{ supply: black, hex: '#1a1a1a' }, { supply: orange, hex: '#f57c00' }], 5, 'Cat decal', 'a cat')
    expect(design.layers.map((l) => l.supplyId)).toEqual(['v-black', 'v-orange'])
    expect(design.widthIn).toBeCloseTo(5.5, 1) // 5 in art + 0.25 in margins
    const rendered = await renderDesign(design)
    expect(rendered.problems).toEqual([])
    expect(rendered.layers.every((l) => l.shape.length > 0)).toBe(true)
    const check = checkDesign(rendered, { supplies: [black, orange], mode: 'cut' })
    expect(check.problems).toEqual([])
    const svg = exportSvg(rendered, design.title)
    expect(svg).toMatch(/Permanent vinyl — Black/)
    expect(svg).toMatch(/Permanent vinyl — Orange/)
  })
})

describe('Recraft client', () => {
  it('asks for art in only the chosen colors and logs the cost', async () => {
    await setSecret('recraftApiKey', 'rk-test')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: b64(CAT) }] }), { status: 200 }))
    const svg = await makeVectorArt('a cat', ['#1a1a1a', '#f57c00'])
    expect(svg).toContain('<svg')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://external.api.recraft.ai/v1/images/generations')
    expect(init.headers.Authorization).toBe('Bearer rk-test')
    const body = JSON.parse(init.body)
    expect(body.controls.colors).toEqual([{ rgb: [26, 26, 26] }, { rgb: [245, 124, 0] }])
    expect(body.response_format).toBe('b64_json')
    const usage = await db.usage.toArray()
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({ feature: 'image', costUsd: 0.08 })
  })

  it('explains a bad key in plain words', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }))
    expect((await testRecraftKey('nope')).error).toMatch(/didn't work/)
  })
})

describe('OpenAI client', () => {
  it('asks for transparent stickers and returns PNGs', async () => {
    await setSecret('openaiApiKey', 'sk-test')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: b64('png-1') }, { b64_json: b64('png-2') }] }), { status: 200 }))
    const pngs = await makeStickerArt('a fox', 2)
    expect(pngs).toHaveLength(2)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ n: 2, background: 'transparent', output_format: 'png' })
    expect((await db.usage.toArray())[0].costUsd).toBeCloseTo(0.12)
  })

  it('explains organization verification', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"message":"Your organization must be verified to use this model"}}', { status: 403 }))
    expect(await testOpenAiKey('sk-x')).toMatch(/verified/)
  })
})

describe('illustrated vinyl in a project', () => {
  it('shows only when a Recraft key is saved, and saves the artwork as the design', async () => {
    const black = await saveSupply(vinyl('v-black', 'Black'))
    const orange = await saveSupply(vinyl('v-orange', 'Orange'))
    const project = await saveProject({ title: 'Cat decal', summary: 'A cat for the car window', goal: 'decor', goalContext: {}, status: 'idea', uses: [{ supplyId: black.id, amount: 1 }], missing: [], toolsNeeded: [], equipmentNeeded: [], steps: [], designTips: '', safetyNotes: [], aiGenerated: true } as never)
    const user = userEvent.setup()
    const view = () => (
      <MemoryRouter>
        <DesignView project={project} supplies={[black, orange]} />
      </MemoryRouter>
    )
    const { rerender } = render(view())
    expect(await screen.findByText(/Turn on extra abilities in Settings/)).toBeInTheDocument()

    await setSecret('recraftApiKey', 'rk-test')
    rerender(view())
    await user.click(await screen.findByText(/Illustrated vinyl art/))
    await user.click(screen.getByLabelText('Black — Permanent vinyl'))
    await user.click(screen.getByLabelText('Orange — Permanent vinyl'))
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: b64(CAT) }] }), { status: 200 }))
    await user.click(screen.getByRole('button', { name: /Make vinyl artwork/ }))
    await waitFor(async () => expect((await db.projects.get(project.id))?.design?.art).toHaveLength(2))
    const saved = (await db.projects.get(project.id))!
    expect(saved.design!.layers.map((l) => l.supplyId)).toEqual([black.id, orange.id])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).prompt).toMatch(/^Cat decal\. A cat for the car window.*flat colors/)
  })
})
