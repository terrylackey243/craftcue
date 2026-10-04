// The crafter's own list of color names (plain and expanded colors, never brand names), each with
// one or more sample shades. Picked colors are named after the closest one on the list, compared
// the way eyes see color (CIE Lab), and new shades can be added or taught to an existing name.
import { isPlainColor, nameOfHex } from './colorGuess'

export interface ColorEntry {
  name: string
  /** Sample shades for this name; picks close to any of them get this name. */
  hexes: string[]
}

const D = (name: string, ...hexes: string[]): ColorEntry => ({ name, hexes })

/** The starting list: every name the plain-color namer can give, plus common expanded colors. */
export const DEFAULT_COLORS: ColorEntry[] = [
  D('Black', '#1a1a1a'), D('Charcoal', '#3a3a3a'), D('Dark gray', '#555555'), D('Gray', '#8a8a8a'), D('Light gray', '#c0c0c0'), D('Pale gray', '#dedede'), D('Silver', '#c0c0c8'),
  D('White', '#ffffff'), D('Off-white', '#f4f1e8'), D('Cream', '#f3e9cc'), D('Ivory', '#f8f3e3'), D('Beige', '#e3d3b4'),
  D('Tan', '#d2b48c'), D('Kraft', '#c8a47e'), D('Brown', '#7b4b2a'), D('Dark brown', '#4a2e1c'), D('Chocolate', '#5a3622'), D('Copper', '#b8733a'), D('Bronze', '#a97142'), D('Clay', '#b66a50'),
  D('Dark red', '#8b1a1a'), D('Red', '#c62828'), D('Cherry', '#c21e3a'), D('Brick', '#a33a2a'), D('Burgundy', '#7a1f33'), D('Wine', '#722f37'), D('Maroon', '#6e1a2a'),
  D('Pink', '#f58cb5'), D('Light pink', '#f8b7cd'), D('Pale pink', '#fbe3ea'), D('Hot pink', '#ff4fa0'), D('Magenta', '#d0308f'), D('Fuchsia', '#d633a8'), D('Rose', '#e0607e'), D('Blush', '#f2b8c0'), D('Bubble gum', '#ffc1cc'), D('Berry', '#990f4b'),
  D('Coral', '#ff7f60'), D('Salmon', '#f59a80'), D('Red-orange', '#e8501e'), D('Orange', '#f57c00'), D('Dark orange', '#c45a0a'), D('Light orange', '#f8b070'), D('Peach', '#f4c4a0'), D('Pale peach', '#f8e0d0'), D('Pumpkin', '#e8761e'), D('Tangerine', '#f68b1f'), D('Tawny', '#cd5700'),
  D('Gold', '#c9a227'), D('Mustard', '#c8a415'), D('Goldenrod', '#daa520'), D('Yellow', '#f9d71c'), D('Light yellow', '#f3e28a'), D('Pale yellow', '#f8f0c0'), D('Lemon', '#fff44f'),
  D('Olive', '#708238'), D('Lime green', '#8bc34a'), D('Light lime green', '#c5e384'), D('Sage', '#9caf88'), D('Mint', '#98e0c0'),
  D('Dark green', '#1e5631'), D('Green', '#2e8b3e'), D('Light green', '#90d090'), D('Pale green', '#d4efd4'), D('Forest green', '#2e5e3a'), D('Kelly green', '#2ca02c'), D('Emerald', '#1f9d55'), D('Jade', '#00a86b'),
  D('Teal', '#1b8a8a'), D('Dark teal', '#0e5555'), D('Turquoise', '#30c5c0'), D('Aqua', '#40d0e0'), D('Light aqua', '#b8e4e4'), D('Pale aqua', '#ddf2f2'),
  D('Navy', '#1f2a56'), D('Dark blue', '#1a3a7a'), D('Blue', '#1e6fd0'), D('Royal blue', '#2446a8'), D('Cobalt', '#1f4fbf'), D('Denim', '#3d5a80'), D('Light blue', '#a7c4e8'), D('Pale blue', '#dde8f6'), D('Sky blue', '#87ceeb'), D('Baby blue', '#a7c7e7'), D('Periwinkle', '#8c9ce8'),
  D('Indigo', '#3f3f9f'), D('Purple', '#6a3fa0'), D('Dark purple', '#3e2160'), D('Violet', '#7f4fc9'), D('Grape', '#6f2da8'), D('Plum', '#6e3a6e'), D('Lavender', '#b8a2d8'), D('Pale lavender', '#e4dcf0'), D('Lilac', '#c8a2c8'), D('Orchid', '#da70d6'),
  D('Rose gold', '#b76e79'),
]

// ----- color science: compare colors the way people see them -----

function toLab(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)]
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** How different two colors look (CIE76 ΔE): about 2 is barely noticeable, 10+ clearly different. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** Close enough to a color on the list to just use its name. */
export const CLOSE = 14

// ----- the current list (set from the crafter's settings when the app loads) -----

let current: ColorEntry[] = DEFAULT_COLORS
export function setColorList(list: ColorEntry[] | undefined) {
  current = list?.length ? list : DEFAULT_COLORS
}
export const getColorList = () => current

export interface ColorMatch {
  entry: ColorEntry
  distance: number
}

/** Colors on the list, closest first. */
export function closestColors(hex: string, list = current): ColorMatch[] {
  return list
    .map((entry) => ({ entry, distance: Math.min(...entry.hexes.map((h) => deltaE(h, hex))) }))
    .sort((a, b) => a.distance - b.distance)
}

/** The list color a pick is close to, or null when nothing on the list is close. */
export function matchColor(hex: string, list = current): ColorMatch | null {
  const best = closestColors(hex, list)[0]
  return best && best.distance <= CLOSE ? best : null
}

/** The name for a picked color: the close list color, or a plain description to add. */
export function nameForHex(hex: string, list = current): string {
  return matchColor(hex, list)?.entry.name ?? nameOfHex(hex)
}

// ----- editing the list (pure; the caller saves the result) -----

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Add a color, or add this shade to the color with that name if there already is one. */
export function addColor(list: ColorEntry[], name: string, hex: string): ColorEntry[] {
  const clean = name.trim()
  if (!clean) return list
  const found = list.find((e) => same(e.name, clean))
  if (found) return list.map((e) => (e === found ? { ...e, hexes: e.hexes.includes(hex) ? e.hexes : [...e.hexes, hex] } : e))
  return [...list, { name: clean, hexes: [hex] }]
}

export function renameColor(list: ColorEntry[], from: string, to: string): ColorEntry[] {
  const clean = to.trim()
  if (!clean || list.some((e) => same(e.name, clean) && !same(e.name, from))) return list
  return list.map((e) => (same(e.name, from) ? { ...e, name: clean } : e))
}

export function removeColor(list: ColorEntry[], name: string): ColorEntry[] {
  return list.filter((e) => !same(e.name, name))
}

/** Replace a color's shades with one (when its swatch is re-picked in settings). */
export function setColorShade(list: ColorEntry[], name: string, hex: string): ColorEntry[] {
  return list.map((e) => (same(e.name, name) ? { ...e, hexes: [hex] } : e))
}

// ----- learning from names the crafter typed -----

export interface LearnResult {
  list: ColorEntry[]
  /** Names that got a new shade (or were added as plain colors). */
  learned: string[]
  /** Names that aren't color words (maybe brand names): ask before adding. */
  ask: { name: string; hex: string }[]
}

/**
 * When a picked swatch was saved under a different name than the list would give it, teach the
 * list: a name already on it gets this shade; a new plain color is added; anything else is asked.
 */
export function learnFromNames(list: ColorEntry[], pairs: { name: string; hex?: string }[]): LearnResult {
  let next = list
  const learned: string[] = []
  const ask: LearnResult['ask'] = []
  for (const { name, hex } of pairs) {
    const base = name.trim().replace(/\s+\d+$/, '') // "Light yellow 2" is still Light yellow
    if (!hex || !base) continue
    const match = matchColor(hex, next)
    if (match && same(base, match.entry.name)) continue // the list already names it this
    const entry = next.find((e) => same(e.name, base))
    if (entry) {
      if (Math.min(...entry.hexes.map((h) => deltaE(h, hex))) < 2) continue // already knows this shade
      next = addColor(next, entry.name, hex)
      learned.push(entry.name)
    } else if (isPlainColor(base)) {
      next = addColor(next, base, hex)
      learned.push(base)
    } else if (!ask.some((a) => same(a.name, base))) ask.push({ name: base, hex })
  }
  return { list: next, learned: [...new Set(learned)], ask }
}
