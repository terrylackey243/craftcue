// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { setFontLoader } from '../../src/lib/design/fonts'
import { renderDesign } from '../../src/lib/design/render'
import { exportSvg } from '../../src/lib/design/export'
import { checkDesign, materialSize } from '../../src/lib/design/checks'
import { bbox, boxH, boxW, pieces, UNITS_PER_IN } from '../../src/lib/design/geometry'
import { DesignSchema, type Design } from '../../src/lib/design/spec'
import type { Supply } from '../../src/types'
import { getMachine } from '../../src/data'
import { designSpaceSteps } from '../../src/components/DesignView'

const load = (name: string): Design => DesignSchema.parse(JSON.parse(readFileSync(`tests/fixtures/designs/${name}.json`, 'utf8')))
const supply = (id: string, dims: string): Supply => ({ id, name: id, category: 'cardstock-paper', quantity: 3, unit: 'sheet', dimensions: dims, source: 'manual', createdAt: '', updatedAt: '' })

beforeAll(() => {
  setFontLoader(async (file) => {
    const b = readFileSync(`public/fonts/${file}`)
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  })
})

// Set DESIGN_PREVIEW=1 to write the SVGs to .design-preview/ for a visual check.
function preview(name: string, svg: string) {
  if (!process.env.DESIGN_PREVIEW) return
  mkdirSync('.design-preview', { recursive: true })
  writeFileSync(`.design-preview/${name}.svg`, svg)
}

describe('design engine', () => {
  it('draws the botanical: one background, one welded stem, leaves in two greens, score veins', async () => {
    const r = await renderDesign(load('botanical'))
    const layer = (id: string) => r.layers.find((l) => l.id === id)!
    expect(pieces(layer('bg').shape)).toHaveLength(1)
    expect(pieces(layer('stem').shape)).toHaveLength(1)
    const leaves = pieces(layer('leafA').shape).length + pieces(layer('leafB').shape).length
    expect(leaves).toBeGreaterThanOrEqual(12) // some leaves may touch and weld within a color
    expect(layer('veins').lines.length).toBeGreaterThanOrEqual(15)
    const bg = bbox(layer('bg').shape)
    expect(boxW(bg) / UNITS_PER_IN).toBeCloseTo(8, 2)
    expect(boxH(bg) / UNITS_PER_IN).toBeCloseTo(10, 2)
    expect(r.problems).toEqual([])
    preview('botanical', exportSvg(r, 'Botanical'))
  })

  it('draws the sign: welded script, capital letters at the requested height, traced backing', async () => {
    const r = await renderDesign(load('sign'))
    preview('sign', exportSvg(r, 'Sign'))
    const words = r.layers.find((l) => l.id === 'words')!
    // "Happy Fall" in Lobster: joined letters weld, so fewer pieces (6) than letters (9).
    expect(pieces(words.shape).length).toBeLessThanOrEqual(7)
    const backing = r.layers.find((l) => l.id === 'backing')!
    const wb = bbox(words.shape)
    const bb = bbox(backing.shape)
    expect(bb.minX).toBeLessThan(wb.minX) // the backing sticks out around the words
    expect(bb.maxY).toBeGreaterThan(wb.maxY)
  })

  it('exports an SVG in real inches with one group per material', async () => {
    const svg = exportSvg(await renderDesign(load('botanical')), 'Botanical')
    expect(svg).toContain('width="8in" height="10in" viewBox="0 0 8000 10000"')
    for (const name of ['Solar White cardstock', 'Husk cardstock', 'Terra Green cardstock', 'Gamma Green cardstock', 'Leaf veins (score)']) expect(svg).toContain(`id="${name}"`)
  })

  it('catches designs that will not fit the machine, the sheet, or Print Then Cut', async () => {
    const design = load('botanical')
    const r = await renderDesign(design)
    const supplies = [supply('sup-white', '8.5 x 11 in'), supply('sup-husk', '8.5 x 11 in'), supply('sup-terra', '8.5 x 11 in'), supply('sup-gamma', '8.5 x 11 in')]
    expect(checkDesign(r, { machine: getMachine('cricut-maker-5'), supplies, mode: 'cut' }).problems).toEqual([])
    // An 11 x 14 background won't come out of 8.5 x 11 cardstock.
    const big = await renderDesign({ ...design, widthIn: 11, heightIn: 14, elements: [{ kind: 'shape', layer: 'bg', shape: 'rectangle', x: 5.5, y: 7, widthIn: 11, heightIn: 14, rotationDeg: 0 }] })
    expect(checkDesign(big, { machine: getMachine('cricut-maker-5'), supplies, mode: 'cut' }).problems.join()).toMatch(/won't fit on your sup-white \(8\.5 x 11 in\)/)
    // A Joy can't cut something 8 in wide.
    expect(checkDesign(r, { machine: getMachine('cricut-joy'), supplies: [], mode: 'cut' }).problems.join()).toMatch(/wider than your machine can cut \(4\.5 in\)/)
    expect(checkDesign(r, { machine: getMachine('cricut-maker-5'), supplies: [], mode: 'print-then-cut' }).problems.join()).toMatch(/at most 9\.25 × 6\.75 in/)
  })

  it('flags a layer hidden under the layers above it', async () => {
    const ok = checkDesign(await renderDesign(load('sign')), { supplies: [], mode: 'cut' })
    expect(ok.problems).toEqual([])
    const hidden = checkDesign(await renderDesign(load('sign-hidden')), { supplies: [], mode: 'cut' })
    expect(hidden.problems.join()).not.toMatch(/Solar White vinyl/) // the backing is mostly visible around the words
    const onlyUnder = await renderDesign({ ...load('sign-hidden'), elements: load('sign-hidden').elements.filter((e) => !(e.kind === 'outline')) })
    expect(checkDesign(onlyUnder, { supplies: [], mode: 'cut' }).problems.join()).toMatch(/“Solar White vinyl” layer is hidden/)
  })

  it('reads material sizes', () => {
    expect(materialSize('8.5 x 11 in', 'sheet')).toEqual({ w: 8.5, h: 11 })
    expect(materialSize('12 in x 10 ft roll', 'roll')).toEqual({ w: 12, h: Infinity })
    expect(materialSize('12 x 12 in', 'sheet')).toEqual({ w: 12, h: 12 })
    expect(materialSize('small', 'pack')).toBeUndefined()
  })
})

describe('design problems that go back to the designer', () => {
  it('flags a leaf almost touching the words on the same layer (from a real design)', async () => {
    const r = await renderDesign(load('live-sign-touching'))
    expect(r.problems.join()).toMatch(/The words “Happy” and the leaf are touching or almost touching/)
  })
})

describe('score lines belong to the pieces they sit on', () => {
  it('leaf veins land on leaves, not the background or stem', async () => {
    const { linesOn } = await import('../../src/lib/design/geometry')
    const r = await renderDesign(load('botanical'))
    const veins = r.layers.find((l) => l.id === 'veins')!.lines
    const onLeaves = linesOn(veins, [...r.layers.find((l) => l.id === 'leafA')!.shape, ...r.layers.find((l) => l.id === 'leafB')!.shape])
    expect(onLeaves.length).toBe(veins.length)
    expect(linesOn(veins, r.layers.find((l) => l.id === 'stem')!.shape).length).toBe(0)
  })
})

describe('Print Then Cut designs', () => {
  it('joins the outline into one piece, scores fold bars as one line, and flags overlapping extra pieces', async () => {
    const d = load('live-coffee-ptc')
    const r = await renderDesign(d)
    const layer = (id: string) => r.layers.find((l) => l.id === id)!
    expect(pieces(layer('cutOutline').shape)).toHaveLength(1)
    expect(layer('foamScore').lines).toHaveLength(1)
    expect(layer('foamScore').shape).toHaveLength(0)
    const check = checkDesign(r, { supplies: [], mode: d.mode })
    expect(check.problems.join(' ')).toMatch(/Light Brown foam easel back” piece overlaps the printed piece/)
    const steps = designSpaceSteps(r, true).join(' ')
    expect(steps).toMatch(/“Sign cutout \(Solar White cardstock\)” and “Coffee-themed print design”.*Flatten/)
  })

  it('keeps one outline per sticker on a sticker sheet', async () => {
    const d = { ...load('live-coffee-ptc'), product: 'sticker-sheet' as const }
    const r = await renderDesign(d)
    expect(pieces(r.layers.find((l) => l.id === 'cutOutline')!.shape).length).toBeGreaterThan(1)
  })
})
