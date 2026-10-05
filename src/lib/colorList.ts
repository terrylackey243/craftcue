// The crafter's own list of color names (plain and familiar expanded colors, never brand names),
// each with one or more sample shades. A picked color is named in two steps, the way people do:
// first which color it is (brown, blue, yellow…), then the closest name of that color on the list
// (compared with CIEDE2000), with plain names preferred unless a fancier one is clearly closer.
// New shades can be added or taught to an existing name.
import xkcd from '../data/xkcdColors.json'
import { isPlainColor, nameOfHex, type ColorFamily } from './colorGuess'

export interface ColorEntry {
  name: string
  /** Sample shades for this name; picks close to any of them get this name. */
  hexes: string[]
  /** Which basic color it is (Olive green → Green). Colors the crafter adds get it from the nearest standard color. */
  family?: ColorFamily
}

const D = (name: string, ...hexes: string[]): ColorEntry => ({ name, hexes })

/** The xkcd survey list, the standard list from 2026-10-05 to 10-06: kept to move saved lists off it. */
export const XKCD_COLORS: ColorEntry[] = (xkcd.colors as [string, string][]).map(([name, hex]) => D(name, hex))

/** The first standard list (before 2026-10-05), kept to find what a crafter changed on it. */
export const LEGACY_COLORS: ColorEntry[] = [
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

/** The standard list from 2026-10-06 (basic-2), kept to move saved lists off it. */
export const BASIC2_COLORS: ColorEntry[] = [
  ...LEGACY_COLORS,
  D('Light brown', '#a87a52'), D('Sand', '#e2ca76'), D('Khaki', '#c3b091'), D('Taupe', '#9c8a7a'), D('Mauve', '#b784a7'),
  D('Light red', '#e57373'), D('Light purple', '#b39ddb'), D('Seafoam', '#9fe2bf'), D('Light teal', '#7fcdcd'), D('Dark pink', '#c2185b'),
]

const F = (name: string, family: ColorFamily, ...hexes: string[]): ColorEntry => ({ name, family, hexes })

/**
 * The standard list: plain colors with light/dark shades, familiar expanded colors, and the muted
 * colors crafters buy (sage, slate, espresso…). Every name says which basic color it is, so a
 * color's family never depends on hue cutoffs.
 */
export const DEFAULT_COLORS: ColorEntry[] = [
  // Black, gray, white
  F('Black', 'Black', '#1a1a1a', '#222222'), F('Charcoal', 'Gray', '#3a3a3a', '#404244'), F('Dark gray', 'Gray', '#555555'), F('Gray', 'Gray', '#8a8a8a'), F('Light gray', 'Gray', '#c0c0c0'),
  F('Pale gray', 'Gray', '#dedede'), F('Silver', 'Gray', '#c0c0c8'), F('Slate gray', 'Gray', '#708090', '#6b7680'),
  F('White', 'White', '#ffffff', '#f7f7f5'), F('Off-white', 'White', '#f4f1e8'), F('Ivory', 'White', '#f8f3e3'), F('Cream', 'White', '#f3e9cc', '#efe4c4'),
  // Browns and tans
  F('Beige', 'Brown', '#e3d3b4', '#dccdb0'), F('Sand', 'Brown', '#d8c08c', '#dcc69a', '#c2b280'), F('Tan', 'Brown', '#d2b48c', '#c9ad84'), F('Khaki', 'Brown', '#c3b091', '#bdb07a'),
  F('Camel', 'Brown', '#c19a6b', '#b88a58'), F('Kraft', 'Brown', '#c8a47e', '#b98f63'), F('Taupe', 'Brown', '#9c8a7a', '#8b7d6b'), F('Light brown', 'Brown', '#a87a52', '#b08860'),
  F('Brown', 'Brown', '#7b4b2a', '#8a5a35', '#9c5e34'), F('Mocha', 'Brown', '#6f4e37', '#7b5a46'), F('Dark brown', 'Brown', '#4a2e1c'), F('Chocolate', 'Brown', '#5a3622'),
  F('Espresso', 'Brown', '#3b2a1e', '#4a3428', '#3b3328'), F('Copper', 'Brown', '#b8733a', '#a8652e'), F('Bronze', 'Brown', '#a97142'), F('Rust', 'Brown', '#b7410e', '#a5492a'),
  F('Terracotta', 'Orange', '#c86f4f', '#b8623f'), F('Clay', 'Brown', '#b66a50'),
  // Reds
  F('Dark red', 'Red', '#8b1a1a'), F('Red', 'Red', '#c62828', '#d32f2f'), F('Light red', 'Red', '#e57373'), F('Cherry', 'Red', '#c21e3a'), F('Brick', 'Red', '#a33a2a'),
  F('Burgundy', 'Red', '#7a1f33'), F('Wine', 'Red', '#722f37'), F('Maroon', 'Red', '#6e1a2a'),
  // Pinks
  F('Pink', 'Pink', '#f58cb5'), F('Light pink', 'Pink', '#f8b7cd'), F('Pale pink', 'Pink', '#fbe3ea'), F('Dark pink', 'Pink', '#c2185b'), F('Hot pink', 'Pink', '#ff4fa0'),
  F('Magenta', 'Pink', '#d0308f'), F('Fuchsia', 'Pink', '#d633a8'), F('Rose', 'Pink', '#e0607e'), F('Blush', 'Pink', '#f2b8c0', '#e8b4b8'), F('Dusty rose', 'Pink', '#c4848e', '#b87f87'),
  F('Bubble gum', 'Pink', '#ffc1cc'), F('Berry', 'Pink', '#990f4b'), F('Mauve', 'Purple', '#b784a7', '#a87c96'), F('Rose gold', 'Pink', '#b76e79'),
  // Oranges
  F('Coral', 'Orange', '#ff7f60'), F('Salmon', 'Orange', '#f59a80'), F('Red-orange', 'Orange', '#e8501e'), F('Orange', 'Orange', '#f57c00'), F('Dark orange', 'Orange', '#c45a0a'),
  F('Light orange', 'Orange', '#f8b070'), F('Peach', 'Orange', '#f4c4a0'), F('Pale peach', 'Orange', '#f8e0d0'), F('Pumpkin', 'Orange', '#e8761e'), F('Tangerine', 'Orange', '#f68b1f'),
  F('Tawny', 'Orange', '#cd5700'),
  // Yellows
  F('Gold', 'Yellow', '#c9a227', '#d4af37'), F('Mustard', 'Yellow', '#c8a415', '#d4a72c', '#b8901f'), F('Goldenrod', 'Yellow', '#daa520'), F('Yellow', 'Yellow', '#f9d71c', '#ffe135'),
  F('Light yellow', 'Yellow', '#f3e28a', '#fbe98f'), F('Pale yellow', 'Yellow', '#f8f0c0'), F('Butter', 'Yellow', '#f6e7a1', '#f3e3a0'), F('Lemon', 'Yellow', '#fff44f'),
  // Greens
  F('Chartreuse', 'Green', '#c7ba36', '#b5c935', '#c2c94a'), F('Lime green', 'Green', '#8bc34a'), F('Light lime green', 'Green', '#c5e384'), F('Olive', 'Green', '#808000', '#6b6b2a', '#7a7a3a'),
  F('Olive green', 'Green', '#677a2e', '#5a6b32'), F('Sage', 'Green', '#9caf88', '#8a9a78', '#7b7e5f'), F('Mint', 'Green', '#98e0c0', '#aee6c8'), F('Seafoam', 'Green', '#9fe2bf', '#93d8c0'),
  F('Dark green', 'Green', '#1e5631'), F('Green', 'Green', '#2e8b3e'), F('Light green', 'Green', '#90d090'), F('Pale green', 'Green', '#d4efd4'), F('Forest green', 'Green', '#2e5e3a'),
  F('Kelly green', 'Green', '#2ca02c'), F('Emerald', 'Green', '#1f9d55'), F('Jade', 'Green', '#00a86b'),
  // Blues (teals and aquas included)
  F('Teal', 'Blue', '#1b8a8a'), F('Dark teal', 'Blue', '#0e5555'), F('Light teal', 'Blue', '#7fcdcd'), F('Slate teal', 'Blue', '#7f9a99', '#6d8b8a'), F('Turquoise', 'Blue', '#30c5c0'),
  F('Aqua', 'Blue', '#40d0e0'), F('Light aqua', 'Blue', '#b8e4e4'), F('Pale aqua', 'Blue', '#ddf2f2', '#cce0e0'), F('Navy', 'Blue', '#1f2a56'), F('Dark blue', 'Blue', '#1a3a7a'),
  F('Blue', 'Blue', '#1e6fd0'), F('Royal blue', 'Blue', '#2446a8'), F('Cobalt', 'Blue', '#1f4fbf'), F('Denim', 'Blue', '#3d5a80'), F('Slate blue', 'Blue', '#6a7fa0', '#5b6f8f'),
  F('Dusty blue', 'Blue', '#8aa4bd', '#7d98b0'), F('Light blue', 'Blue', '#a7c4e8'), F('Pale blue', 'Blue', '#dde8f6'), F('Sky blue', 'Blue', '#87ceeb'), F('Baby blue', 'Blue', '#a7c7e7'),
  F('Periwinkle', 'Purple', '#8c9ce8'),
  // Purples
  F('Indigo', 'Purple', '#3f3f9f'), F('Purple', 'Purple', '#6a3fa0'), F('Dark purple', 'Purple', '#3e2160'), F('Light purple', 'Purple', '#b39ddb'), F('Violet', 'Purple', '#7f4fc9'),
  F('Grape', 'Purple', '#6f2da8'), F('Plum', 'Purple', '#6e3a6e'), F('Lavender', 'Purple', '#b8a2d8'), F('Pale lavender', 'Purple', '#e4dcf0'), F('Lilac', 'Purple', '#c8a2c8'),
  F('Orchid', 'Purple', '#da70d6'),
]
/** Which standard list a saved list was built on; older saved lists are moved onto this one. */
export const COLOR_LIST_BASE = 'named-3'

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

const labCache = new Map<string, [number, number, number]>()
const lab = (hex: string) => {
  let v = labCache.get(hex)
  if (!v) labCache.set(hex, (v = toLab(hex)))
  return v
}

/**
 * How different two colors look (CIEDE2000): about 1 is barely noticeable, 5+ clearly different.
 * Better than straight-line Lab distance in yellows, tans and blues. `kL` 2+ cares less about
 * light vs dark (the textile setting): shadow and shine on one material.
 */
export function deltaE(hexA: string, hexB: string, kL = 1): number {
  const [L1, a1, b1] = lab(hexA)
  const [L2, a2, b2] = lab(hexB)
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h = (b: number, a: number) => (a === 0 && b === 0 ? 0 : ((Math.atan2(b, a) / rad) + 360) % 360)
  const h1p = h(b1, a1p)
  const h2p = h(b2, a2p)
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) dhp = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad)
  const Lmp = (L1 + L2) / 2
  const Cmp = (C1p + C2p) / 2
  let hmp = h1p + h2p
  if (C1p * C2p !== 0) hmp = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
  const T = 1 - 0.17 * Math.cos((hmp - 30) * rad) + 0.24 * Math.cos(2 * hmp * rad) + 0.32 * Math.cos((3 * hmp + 6) * rad) - 0.2 * Math.cos((4 * hmp - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hmp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lmp - 50) ** 2) / Math.sqrt(20 + (Lmp - 50) ** 2)
  const Sc = 1 + 0.045 * Cmp
  const Sh = 1 + 0.015 * Cmp * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dLp / (kL * Sl)) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
}

/** Close enough to a color on the list to just use its name. */
export const CLOSE = 10

// ----- the current list (set from the crafter's settings when the app loads) -----

let current: ColorEntry[] = DEFAULT_COLORS
const nameCache = new Map<string, string>()
export function setColorList(list: ColorEntry[] | undefined) {
  const next = list?.length ? list : DEFAULT_COLORS
  if (next !== current) {
    nameCache.clear()
    familyCache.clear()
  }
  current = next
}
export const getColorList = () => current

export interface ColorMatch {
  entry: ColorEntry
  distance: number
}

/** Plain names (Red, Light blue, Dark brown) win over fancier ones unless those are clearly closer. */
const PLAIN = /^((light|pale|dark|hot) )?(red|orange|yellow|green|blue|purple|pink|brown|gray|black|white|tan|navy|teal)$/i
const PLAIN_BONUS = 0.85

/** Colors on the list, closest first (plain names get a small head start). */
export function closestColors(hex: string, list = current): ColorMatch[] {
  return list
    .map((entry) => {
      const distance = Math.min(...entry.hexes.map((h) => deltaE(h, hex)))
      return { entry, distance, rank: PLAIN.test(entry.name) ? distance * PLAIN_BONUS : distance }
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ entry, distance }) => ({ entry, distance }))
}

/** The basic color of a list entry: its own, or the nearest standard color's for added ones. */
export function entryFamily(e: ColorEntry): ColorFamily {
  if (e.family) return e.family
  const std = DEFAULT_COLORS.map((d) => ({ d, dist: Math.min(...d.hexes.map((h) => deltaE(h, e.hexes[0] ?? '#808080'))) })).sort((x, y) => x.dist - y.dist)[0]
  return std.d.family!
}

const familyCache = new Map<string, ColorFamily>()
/**
 * Which basic color a hex is: the family of the color it's named after (on the crafter's list, so
 * a shade they taught counts), never hue cutoffs.
 */
export function colorFamilyOf(hex: string, list = current): ColorFamily {
  const key = list === current ? hex : ''
  const hit = key ? familyCache.get(key) : undefined
  if (hit) return hit
  // The same top match that names the color, so the name and its family always agree.
  const top = closestColors(hex, list)[0]
  const fam = top ? entryFamily(top.entry) : 'Gray'
  if (key) familyCache.set(key, fam)
  return fam
}

/** Light, medium or dark (Lab lightness). */
export function shadeOf(hex: string): 'light' | 'medium' | 'dark' {
  const L = lab(hex)[0]
  return L >= 72 ? 'light' : L < 42 ? 'dark' : 'medium'
}

/** The list color a pick is close to, or null when nothing on the list is close. */
export function matchColor(hex: string, list = current): ColorMatch | null {
  const best = closestColors(hex, list)[0]
  return best && best.distance <= CLOSE ? best : null
}

/** The name for a picked color: the close list color, or a plain description to add. */
export function nameForHex(hex: string, list = current): string {
  if (list !== current) return matchColor(hex, list)?.entry.name ?? nameOfHex(hex)
  let name = nameCache.get(hex)
  if (name === undefined) nameCache.set(hex, (name = matchColor(hex, list)?.entry.name ?? nameOfHex(hex)))
  return name
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
    // The list already names it this, or it's one of the app's "Light tan / Warm tan" variants of it.
    const core = base.replace(/^((warm|cool|muted|bright|soft|deep|dusty|other)\s+)?((light|dark)\s+)?/i, '')
    if (match && (same(base, match.entry.name) || same(core, match.entry.name))) continue
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

/** The standard list each older base was, to tell what the crafter changed on it. */
const OLD_STANDARD: Record<string, ColorEntry[]> = { legacy: LEGACY_COLORS, 'xkcd-1': XKCD_COLORS, 'basic-2': BASIC2_COLORS }

/**
 * Move a list saved on an older standard list onto the current one, keeping what the crafter
 * changed: colors they added and shades they taught. (Removals and renames of old standard colors
 * don't carry over: those names may not exist any more.)
 */
export function migrateColorList(saved: ColorEntry[] | undefined, base: string | undefined): ColorEntry[] | undefined {
  if (!saved?.length || base === COLOR_LIST_BASE) return saved
  const old = new Map((OLD_STANDARD[base ?? 'legacy'] ?? []).map((e) => [e.name.toLowerCase(), e.hexes]))
  let next = DEFAULT_COLORS
  let changed = false
  for (const e of saved) {
    const was = old.get(e.name.toLowerCase()) ?? []
    for (const hex of e.hexes.filter((h) => !was.includes(h))) {
      next = addColor(next, e.name, hex)
      changed = true
    }
  }
  return changed ? next : undefined
}

// ----- telling a pack's similar colors apart -----

const TONE = /^(light|pale|dark|deep)\s+/i
const QUALIFIERS = ['warm', 'cool', 'muted', 'bright', 'soft', 'deep', 'dusty']
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Names for colors that would otherwise share one ("Tan, Tan 2, Tan 3"): ranked by lightness into
 * Light tan / Tan / Dark tan, and any still tied told apart by warm / cool / muted. Never numbers.
 * Names that are already unique are kept.
 */
export function distinctNames(items: { name: string; hex: string }[]): string[] {
  const out = items.map((i) => i.name)
  const groups = new Map<string, number[]>()
  items.forEach((it, i) => groups.set(it.name.toLowerCase(), [...(groups.get(it.name.toLowerCase()) ?? []), i]))
  for (const idx of groups.values()) {
    if (idx.length < 2) continue
    const base = items[idx[0]].name
    const toned = TONE.test(base) // "Light yellow" ×2: don't make "Light light yellow"
    const byLight = [...idx].sort((a, b) => lab(items[b].hex)[0] - lab(items[a].hex)[0])
    // Tiers: the lightest is Light, the darkest Dark, the rest plain.
    const tiers = new Map<number, string>()
    byLight.forEach((i, rank) => {
      const t = toned ? 1 : rank === 0 ? 0 : rank === byLight.length - 1 ? 2 : 1
      tiers.set(i, t === 0 ? `Light ${lower(base)}` : t === 2 ? `Dark ${lower(base)}` : base)
    })
    // Still tied within a tier: warm / cool / muted…, by warmth (a* + b*) and then strength.
    const byTier = new Map<string, number[]>()
    for (const i of idx) byTier.set(tiers.get(i)!, [...(byTier.get(tiers.get(i)!) ?? []), i])
    for (const [name, members] of byTier) {
      if (members.length < 2) {
        out[members[0]] = name
        continue
      }
      const warmth = (i: number) => lab(items[i].hex)[1] + lab(items[i].hex)[2]
      const chroma = (i: number) => Math.hypot(lab(items[i].hex)[1], lab(items[i].hex)[2])
      const sorted = [...members].sort((a, b) => warmth(b) - warmth(a))
      // warm = warmest, cool = coolest; the rest by how strong the color is.
      const order = [sorted[0], sorted[sorted.length - 1], ...sorted.slice(1, -1).sort((a, b) => chroma(a) - chroma(b))]
      order.forEach((i, q) => {
        out[i] = `${upper(QUALIFIERS[q] ?? 'other')} ${lower(name)}`
      })
    }
  }
  return out
}
