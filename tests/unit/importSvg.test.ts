import { describe, expect, it } from 'vitest'
import { importVectorArt } from '../../src/lib/design/importSvg'
import { area, bbox, boxW, insideShape, pieces, UNITS_PER_IN } from '../../src/lib/design/geometry'

// A cat face: white background, black head, white eyes (details), orange nose on top.
const CAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#ffffff"/>
  <g transform="translate(50 55)">
    <circle r="35" fill="#111"/>
    <circle cx="-12" cy="-8" r="6" fill="white"/>
    <circle cx="12" cy="-8" r="6" style="fill:#fefefe"/>
    <path d="M-5 6 L5 6 L0 12 Z" fill="rgb(240,130,40)"/>
  </g>
</svg>`

describe('vector artwork to cut layers', () => {
  it('drops the white background, knocks white details out, keeps paint order and sizes it', () => {
    const layers = importVectorArt(CAT, ['#000000', '#f28c28'], 4, 5, 5)
    expect(layers.map((l) => l.color)).toEqual(['#000000', '#f28c28']) // head below, nose on top
    const head = layers[0].shape
    // The eyes are holes in the head, so the head is one piece with cut-outs.
    expect(pieces(head)).toHaveLength(1)
    expect(insideShape({ x: 5 * UNITS_PER_IN, y: 5 * UNITS_PER_IN + 1000 }, head)).toBe(true) // below the eyes: solid
    // Scaled so the largest side (the head, 70 of 100 units) is 4 in.
    expect(boxW(bbox(head)) / UNITS_PER_IN).toBeCloseTo(4, 1)
    expect(area(layers[1].shape)).toBeGreaterThan(0)
  })

  it('keeps white when white is one of the chosen colors', () => {
    const layers = importVectorArt(CAT, ['#000000', '#ffffff', '#f28c28'], 4, 5, 5)
    expect(layers.map((l) => l.color)).toEqual(['#000000', '#ffffff', '#f28c28'])
  })

  it('snaps colors to the nearest chosen one', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="4" height="4" fill="#c0392b"/><rect x="5" width="4" height="4" fill="#27ae60"/></svg>`
    const layers = importVectorArt(svg, ['#ff0000', '#00aa00'], 2, 1, 1)
    expect(layers.map((l) => l.color)).toEqual(['#ff0000', '#00aa00'])
  })
})
