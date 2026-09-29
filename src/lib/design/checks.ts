// Will it actually cut? Checks a rendered design against the machine and the materials.
import type { MachineProfile, Supply } from '../../types'
import { area, bbox, boxH, boxW, difference, offset, pieces, union, UNITS_PER_IN } from './geometry'
import type { RenderedDesign } from './render'

const IN = UNITS_PER_IN
/** Print Then Cut's largest printable/cuttable image (Cricut help center). */
export const PRINT_THEN_CUT_MAX = { w: 9.25, h: 6.75 }

/** "8.5 x 11 in", "12 x 12 in", "12 in x 10 ft roll" → size in inches (length Infinity for rolls). */
export function materialSize(dimensions: string | undefined, unit: Supply['unit']): { w: number; h: number } | undefined {
  if (!dimensions) return undefined
  const d = dimensions.toLowerCase()
  const m = d.match(/(\d+(?:\.\d+)?)\s*(?:in|")?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(in|"|ft|feet|yd|yard)?/)
  if (!m) return undefined
  const a = Number(m[1])
  let b = Number(m[2])
  if (m[3]?.startsWith('f')) b *= 12
  if (m[3]?.startsWith('y')) b *= 36
  if (unit === 'roll' || unit === 'ft' || unit === 'yd' || unit === 'in') return { w: a, h: Infinity }
  return { w: Math.min(a, b), h: Math.max(a, b) }
}

const fits = (w: number, h: number, W: number, H: number) => (w <= W + 0.01 && h <= H + 0.01) || (h <= W + 0.01 && w <= H + 0.01)
const inches = (n: number) => `${Math.round((n / IN) * 100) / 100} in`

export interface CheckResult {
  problems: string[] // it won't work as is
  cautions: string[] // it will work, but take care
}

export function checkDesign(r: RenderedDesign, opts: { machine?: MachineProfile; supplies: Supply[]; mode: 'cut' | 'print-then-cut' }): CheckResult {
  const problems: string[] = [...r.problems]
  const cautions: string[] = []
  const byId = new Map(opts.supplies.map((s) => [s.id, s]))
  const cutW = opts.machine?.cutWidthIn ?? 12

  if (opts.mode === 'print-then-cut' && !fits(r.widthIn, r.heightIn, PRINT_THEN_CUT_MAX.h, PRINT_THEN_CUT_MAX.w)) {
    problems.push(`Print Then Cut designs can be at most ${PRINT_THEN_CUT_MAX.w} × ${PRINT_THEN_CUT_MAX.h} in; this one is ${r.widthIn} × ${r.heightIn} in.`)
  }

  // A layer that ends up (almost) entirely under the layers above it can't be seen.
  r.layers.forEach((layer, i) => {
    if ((layer.operation !== 'cut' && layer.operation !== 'print') || !layer.shape.length) return
    const above = r.layers.slice(i + 1).filter((l) => l.operation === 'cut' || l.operation === 'print').flatMap((l) => l.shape)
    if (!above.length) return
    const own = area(layer.shape)
    const visible = area(difference(layer.shape, union(above)))
    if (own > 0 && visible / own < 0.1) problems.push(`The “${layer.name}” layer is hidden under the layers on top of it. Move it up, or move what covers it.`)
  })

  for (const layer of r.layers) {
    if (layer.operation !== 'cut' || !layer.shape.length) continue
    const parts = pieces(layer.shape)
    const supply = layer.supplyId ? byId.get(layer.supplyId) : undefined
    const sheet = supply ? materialSize(supply.dimensions, supply.unit) : undefined
    for (const piece of parts) {
      const b = bbox(piece)
      const w = boxW(b)
      const h = boxH(b)
      if (Math.min(w, h) > cutW * IN) {
        problems.push(`A “${layer.name}” piece is ${inches(w)} × ${inches(h)}: wider than your machine can cut (${cutW} in).`)
        break
      }
      if (sheet && !fits(w / IN, h / IN, sheet.w, sheet.h)) {
        problems.push(`A “${layer.name}” piece (${inches(w)} × ${inches(h)}) won't fit on your ${supply!.name} (${supply!.dimensions}). Make it smaller or piece it together.`)
        break
      }
    }
    const tiny = parts.filter((p) => {
      const b = bbox(p)
      return Math.max(boxW(b), boxH(b)) < 0.15 * IN
    }).length
    if (tiny) cautions.push(`“${layer.name}” has ${tiny} very small piece${tiny === 1 ? '' : 's'} (under 0.15 in); they're fiddly to weed and easy to lose.`)
    // Thin parts: shrink by ~0.3 mm and grow back; whatever disappears was hairline-thin.
    const before = area(layer.shape)
    const after = area(offset(offset(layer.shape, -12), 12))
    if (before > 0 && (before - after) / before > 0.08) cautions.push(`“${layer.name}” has very thin parts that may tear when cutting or weeding. Making it bigger helps.`)
  }
  return { problems, cautions }
}
