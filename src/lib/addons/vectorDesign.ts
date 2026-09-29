// Turn Recraft vector artwork into a normal CraftCue design: one cut layer per chosen stash color.
import { bbox, boxH, boxW, shapeToPathD, UNITS_PER_IN } from '../design/geometry'
import { importVectorArt } from '../design/importSvg'
import type { Design } from '../design/spec'
import type { Supply } from '../../types'

export interface ColorPick {
  supply: Supply
  hex: string
}

const MARGIN_IN = 0.25

/** The prompt sent to Recraft: the description plus what makes it cut well as layered vinyl. */
export function vectorPrompt(description: string): string {
  return `${description.trim()}. Flat vector illustration for layered vinyl cutting: bold simple shapes, solid flat colors, no gradients, no fine lines, no tiny details, no text, white background.`
}

export function buildVectorDesign(svgText: string, picks: ColorPick[], sizeIn: number, title: string, prompt: string): Design {
  const layers = importVectorArt(svgText, picks.map((p) => p.hex), sizeIn, 0, 0)
  if (!layers.length) throw new Error('The artwork came back empty. Try a different description.')
  // Canvas = the artwork plus a small margin, with the artwork moved inside it.
  const b = bbox(layers.flatMap((l) => l.shape))
  const m = MARGIN_IN * UNITS_PER_IN
  const widthIn = Math.round(((boxW(b) + 2 * m) / UNITS_PER_IN) * 100) / 100
  const heightIn = Math.round(((boxH(b) + 2 * m) / UNITS_PER_IN) * 100) / 100
  const shift = (d: typeof layers[number]['shape']) => d.map((poly) => poly.map((p) => ({ x: p.x - b.minX + m, y: p.y - b.minY + m })))
  const byHex = new Map(picks.map((p) => [p.hex, p.supply]))
  const designLayers = layers.map((l, i) => {
    const s = byHex.get(l.color)!
    return { id: `c${i + 1}`, name: [s.name, s.color].filter(Boolean).join(' — '), supplyId: s.id, color: l.color, operation: 'cut' as const }
  })
  return {
    title,
    product: 'decal',
    mode: 'cut',
    widthIn,
    heightIn,
    layers: designLayers,
    elements: [],
    art: layers.map((l, i) => ({ layer: `c${i + 1}`, d: shapeToPathD(shift(l.shape)) })),
    artPrompt: prompt,
    assembly:
      designLayers.length > 1
        ? [
            'Cut and weed each color.',
            `Put the pieces down bottom layer first: ${designLayers.map((l) => l.name).join(', then ')}.`,
            'Use transfer tape for each layer and line it up by eye, pressing from the middle out.',
          ]
        : ['Cut and weed, then apply with transfer tape.'],
  }
}
