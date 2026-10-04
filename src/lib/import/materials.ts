// Work out what an outside project's cut file uses: each color's pieces, laid out on the
// crafter's sheets (or roll), matched to colors in their stash.
import { area, bbox, boxH, boxW, pieces, transform, union, UNITS_PER_IN, type Shape } from '../design/geometry'
import { cssToRgb, dist, readSvg } from '../design/importSvg'
import { materialSize } from '../design/checks'
import { guessHex } from '../colorGuess'
import type { Supply, SupplyUse } from '../../types'

const IN = UNITS_PER_IN
/** Design Space reads SVGs without real units at 72 per inch, so most craft files are made that way. */
export const DEFAULT_DPI = 72
const SAME_COLOR = 12 // anti-aliased exports often have near-identical shades of one color

export interface ColorPart {
  hex: string
  /** Each separate piece's width × height in inches (as drawn). */
  pieces: { w: number; h: number }[]
  areaSqIn: number
}

export interface SvgAnalysis {
  files: string[]
  /** Overall size of the largest file, in inches. */
  widthIn: number
  heightIn: number
  /** True when the files didn't state real sizes and 72 per inch was assumed. */
  sizeAssumed: boolean
  colors: ColorPart[]
  skipped: number
}

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/**
 * Read one or more SVG cut files. `scale` resizes everything (1 = as the files say), so a crafter
 * can make a design bigger or smaller and see the materials change.
 */
export function analyzeSvgs(files: { name: string; text: string }[], scale = 1): SvgAnalysis {
  const groups: { rgb: number[]; shapes: Shape[] }[] = []
  let widthIn = 0
  let heightIn = 0
  let sizeAssumed = false
  let skipped = 0
  for (const f of files) {
    const read = readSvg(f.text)
    skipped += read.skipped
    if (!read.painted.length) continue
    if (!read.unitsPerInch) sizeAssumed = true
    const toIn = (IN / (read.unitsPerInch ?? DEFAULT_DPI)) * scale
    const all = read.painted.map((p) => ({ rgb: p.rgb, shape: transform(p.shape, { scale: toIn }) }))
    const b = bbox(all.flatMap((p) => p.shape))
    widthIn = Math.max(widthIn, boxW(b) / IN)
    heightIn = Math.max(heightIn, boxH(b) / IN)
    for (const p of all) {
      const g = groups.find((x) => dist(x.rgb, p.rgb) < SAME_COLOR)
      if (g) g.shapes.push(p.shape)
      else groups.push({ rgb: p.rgb, shapes: [p.shape] })
    }
  }
  const colors = groups
    .map((g) => {
      const parts = pieces(union(...g.shapes))
        .map((pc) => {
          const b = bbox(pc)
          return { w: boxW(b) / IN, h: boxH(b) / IN, a: area(pc) }
        })
        .filter((pc) => Math.max(pc.w, pc.h) >= 0.05) // stray specks
      return { hex: toHex(g.rgb), pieces: parts.map(({ w, h }) => ({ w, h })), areaSqIn: parts.reduce((n, pc) => n + pc.a, 0) / (IN * IN) }
    })
    .filter((c) => c.pieces.length)
    .sort((a, b) => b.areaSqIn - a.areaSqIn)
  return { files: files.map((f) => f.name), widthIn, heightIn, sizeAssumed, colors, skipped }
}

const GAP = 0.25 // between pieces
const MARGIN = 0.25 // around the edge of the sheet

/**
 * Lay pieces out on sheets the way a cutting machine's mat preview does (biggest first, in rows),
 * turning pieces sideways when that fits. `sheetH` Infinity = a roll: returns the length used.
 */
export function layOut(parts: { w: number; h: number }[], sheetW: number, sheetH: number): { sheets: number; lengthIn: number; tooBig: number } {
  const usableW = sheetW - 2 * MARGIN
  const usableH = sheetH - 2 * MARGIN
  let tooBig = 0
  const fitted = parts
    .map(({ w, h }) => {
      // Lie flat (shorter side as height) when it fits across, so rows stay low.
      const flat = { w: Math.max(w, h), h: Math.min(w, h) }
      if (flat.w <= usableW && flat.h <= usableH) return flat
      if (flat.h <= usableW && flat.w <= usableH) return { w: flat.h, h: flat.w }
      tooBig++
      return null
    })
    .filter((p): p is { w: number; h: number } => p !== null)
    .sort((a, b) => b.h - a.h)
  let sheets = fitted.length ? 1 : 0
  let rowY = 0 // top of the current row
  let rowH = 0
  let x = 0
  let used = 0
  for (const p of fitted) {
    if (x > 0 && x + p.w > usableW) {
      rowY += rowH + GAP
      x = 0
      rowH = 0
    }
    if (rowY + p.h > usableH) {
      sheets++
      rowY = 0
      x = 0
      rowH = 0
    }
    x += p.w + GAP
    rowH = Math.max(rowH, p.h)
    used = Math.max(used, rowY + rowH)
  }
  return { sheets, lengthIn: Number.isFinite(sheetH) ? sheets * sheetH : used + 2 * MARGIN, tooBig }
}

/** Closest stash colors for a color in the file, best first (in-stock colors first when close). */
export function closestSupplies(hex: string, candidates: Supply[], limit = 5): { supply: Supply; distance: number }[] {
  const rgb = cssToRgb(hex) ?? [0, 0, 0]
  return candidates
    .map((s) => ({ supply: s, distance: dist(cssToRgb(guessHex(s.color || s.name)) ?? [0, 0, 0], rgb) + (s.quantity > 0 ? 0 : 30) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
}

/** How much of a stash material one finished piece uses, in a unit the deduction understands. */
export function amountFor(part: ColorPart, s: Supply): SupplyUse & { tooBig: number } {
  const size = materialSize(s.dimensions, s.unit) ?? { w: 12, h: 12 }
  const r = layOut(part.pieces, size.w, size.h)
  if (!Number.isFinite(size.h)) return { supplyId: s.id, amount: Math.ceil(r.lengthIn), unit: 'in', tooBig: r.tooBig }
  return { supplyId: s.id, amount: r.sheets, unit: s.unit, tooBig: r.tooBig }
}
