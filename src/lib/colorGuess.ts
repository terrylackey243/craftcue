// A best guess at a hex color from a craft color name ("Rocket Red", "Sour Apple", "Rose Gold").
// Used to prefill color pickers; the crafter can always correct it.
import { nameForHex } from './colorList'


// Longer, more specific words first so "rose gold" wins over "rose" and "gold".
const WORDS: [string, string][] = [
  ['rose gold', '#b76e79'], ['sour apple', '#9acd32'], ['sky blue', '#87ceeb'], ['navy', '#1f2a56'],
  ['baby blue', '#a7c7e7'], ['royal blue', '#2446a8'], ['forest', '#2e5e3a'], ['mint', '#98e0c0'],
  ['lime', '#8bc34a'], ['olive', '#708238'], ['sage', '#9caf88'], ['teal', '#1b8a8a'],
  ['turquoise', '#30c5c0'], ['aqua', '#40d0e0'], ['coral', '#ff7f60'], ['salmon', '#f59a80'],
  ['peach', '#ffc19e'], ['blush', '#f2b8c0'], ['magenta', '#d0308f'], ['fuchsia', '#d633a8'],
  ['hot pink', '#ff4fa0'], ['pink', '#f58cb5'], ['rose', '#e0607e'], ['burgundy', '#7a1f33'],
  ['maroon', '#6e1a2a'], ['wine', '#722f37'], ['cherry', '#c21e3a'], ['scarlet', '#d0271e'],
  ['red', '#c62828'], ['tangerine', '#f68b1f'], ['orange', '#f57c00'], ['pumpkin', '#e8761e'],
  ['mustard', '#d4a017'], ['lemon', '#fff44f'], ['sunshine', '#ffd23f'], ['yellow', '#f9d71c'],
  ['cream', '#f5ecd2'], ['ivory', '#f8f3e3'], ['kraft', '#c8a47e'], ['tan', '#d2b48c'],
  ['beige', '#e3d3b4'], ['brown', '#7b4b2a'], ['chocolate', '#5a3622'], ['copper', '#b8733a'],
  ['bronze', '#a97142'], ['gold', '#d4af37'], ['silver', '#c0c0c0'], ['charcoal', '#3a3a3a'],
  ['gray', '#8a8a8a'], ['grey', '#8a8a8a'], ['black', '#1a1a1a'], ['white', '#ffffff'],
  ['lavender', '#b8a2d8'], ['lilac', '#c8a2c8'], ['plum', '#6e3a6e'], ['violet', '#7f4fc9'],
  ['purple', '#6a3fa0'], ['orchid', '#da70d6'], ['grape', '#6f2da8'], ['periwinkle', '#8c9ce8'],
  ['brick', '#a33a2a'], ['berry', '#990f4b'], ['bubble gum', '#ffc1cc'], ['bubblegum', '#ffc1cc'], ['fuchsia', '#d633a8'], ['fuchia', '#d633a8'],
  ['goldenrod', '#daa520'], ['clay', '#b66a50'], ['tawny', '#cd5700'], ['moccasin', '#ffe4b5'],
  ['jade', '#00a86b'], ['stone', '#a8a294'], ['granite', '#6b6b6b'], ['concrete', '#9a9a96'], ['burgundy', '#7a1f33'], ['indigo', '#3f3f9f'], ['cobalt', '#1f4fbf'], ['denim', '#3d5a80'],
  ['blue', '#1e6fd0'], ['emerald', '#1f9d55'], ['kelly', '#2ca02c'], ['green', '#2e8b3e'],
]

/**
 * The color word in a name: whole words first ("Martian Green" is green, not tan), then words
 * inside others ("Blueberry" → blue).
 */
const BASIC = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'gray', 'grey', 'black', 'white'])

function colorWordIn(name: string): [string, string] | undefined {
  const n = name.toLowerCase()
  // The first color named wins ("white with black pupils" is white), longer phrases first at a tie.
  let best: { at: number; len: number; entry: [string, string] } | undefined
  for (const entry of WORDS) {
    const m = new RegExp(`\\b${entry[0]}\\b`).exec(n)
    if (m && (!best || m.index < best.at || (m.index === best.at && entry[0].length > best.len))) best = { at: m.index, len: entry[0].length, entry }
  }
  if (best) return best.entry
  // A basic color starting a longer word: "Blueberry", "Bluebonnet" (not "Honeysuckle" → honey).
  return WORDS.find(([w]) => BASIC.has(w) && new RegExp(`\\b${w}`).test(n))
}

export function guessHex(name: string | undefined): string {
  const n = (name ?? '').toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(n.trim())) return n.trim()
  return colorWordIn(n)?.[1] ?? '#888888'
}

const rgbOf = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}

/**
 * A plain, predictable name for a color ("#f0e08a" → "Light yellow", "#a05c30" → "Brown"),
 * built from its hue, lightness and strength. The crafter renames it to the pack's own name.
 */
export function nameOfHex(hex: string): string {
  const { h, s, l } = toHsl(hex)
  const shade = (base: string) => (l > 0.86 ? `Pale ${base}` : l > 0.7 ? `Light ${base}` : l < 0.28 ? `Dark ${base}` : base)
  const cap = (x: string) => x[0].toUpperCase() + x.slice(1).toLowerCase()

  // Grays, black and white: almost no color in it.
  if (l < 0.12) return 'Black'
  if (l > 0.95) return 'White'
  if (s < 0.12 || (s < 0.2 && l < 0.35)) return l > 0.85 ? 'Off-white' : cap(shade('gray'))

  // Browns, tans and creams: orange-to-yellow hues that are dark or dull.
  if (h >= 10 && h < 55) {
    if (l < 0.45 && s < 0.75) return l < 0.25 ? 'Dark brown' : 'Brown'
    if (s < 0.45 && l < 0.82) return 'Tan'
    if (s < 0.5 && l >= 0.82) return 'Cream'
  }

  const pink = l > 0.86 ? 'Pale pink' : 'Pink'
  if (h < 10 || h >= 345) return l > 0.75 ? pink : l < 0.35 ? 'Dark red' : 'Red'
  if (h < 40) {
    if (l > 0.82) return 'Pale peach'
    if (l > 0.68) return 'Peach'
    if (h < 20 && s > 0.5) return 'Red-orange'
    return cap(shade('orange'))
  }
  if (h < 66) {
    if (l < 0.5) return h < 50 ? 'Gold' : 'Mustard'
    return cap(shade('yellow'))
  }
  if (h < 90) return l < 0.4 ? 'Olive' : cap(shade('lime green'))
  if (h < 160) return cap(shade('green'))
  if (h < 195) return cap(shade(l > 0.7 ? 'aqua' : 'teal'))
  if (h < 250) return l < 0.3 ? 'Navy' : cap(shade('blue'))
  if (h < 285) return l > 0.7 ? cap(shade('lavender').replace('Light lavender', 'Lavender')) : cap(shade('purple'))
  if (h < 320) return l > 0.7 ? pink : cap(shade('magenta'))
  return l > 0.75 || s < 0.6 ? pink : 'Hot pink'
}

/** A supply's color as hex: the picked swatch if there is one, otherwise a guess from its name. */
export function supplyHex(s: { colorHex?: string; color?: string; name?: string }): string {
  return s.colorHex || guessHex(s.color || s.name)
}

// ----- plain colors vs brand names -----
// "Rocket Red" and "Astro White" are brand names; the colors are Red and White. A supply's plain
// color comes from its picked swatch, or failing that from a color word in its name.

/** Color words that are really brand-style names, and the plain color to show instead. */
const ALIASES: Record<string, string> = { 'sour apple': 'Lime green', sunshine: 'Yellow', fuchia: 'Fuchsia', bubblegum: 'Bubble gum', grey: 'Gray' }

const MODIFIERS = new Set(['light', 'dark', 'pale', 'hot', 'deep', 'bright', 'pastel', 'neon', 'matte', 'glossy', 'gloss', 'glitter', 'metallic', 'shimmer', 'satin', 'holographic', 'off', 'and', 'with', 'clear'])
const COLOR_WORDS = new Set([...WORDS.filter(([w]) => !(w in ALIASES)).flatMap(([w]) => w.split(' ')), 'grey', 'off-white', 'transparent', 'multicolor', 'multi', 'rainbow'])

const cap = (x: string) => x.replace(/\b\w/g, (c) => c.toUpperCase())

/** True when a color is already written as a plain color ("Light Pink", "matte black"), not a brand name. */
export function isPlainColor(name: string): boolean {
  const words = name.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean)
  return words.length > 0 && words.some((w) => COLOR_WORDS.has(w)) && words.every((w) => COLOR_WORDS.has(w) || MODIFIERS.has(w) || w.split('-').every((p) => COLOR_WORDS.has(p) || MODIFIERS.has(p)))
}

export interface PlainColor {
  name: string
  /** True when it came from a word in a brand name, not a picked swatch (pick one to be sure). */
  guessed: boolean
}

export function plainColor(s: { colorHex?: string; color?: string }): PlainColor | null {
  if (s.colorHex) return { name: nameForHex(s.colorHex), guessed: false }
  const c = (s.color ?? '').trim()
  if (!c) return null
  const alias = ALIASES[c.toLowerCase()]
  if (alias) return { name: alias, guessed: true }
  if (isPlainColor(c)) return { name: cap(c.toLowerCase()), guessed: false }
  const word = colorWordIn(c)?.[0]
  return word ? { name: ALIASES[word] ?? cap(word), guessed: true } : null
}

/** "Red (Rocket Red)", "Light Yellow", or the brand name when no color can be told. */
export function colorLabel(s: { colorHex?: string; color?: string }): string {
  const plain = plainColor(s)
  const brand = (s.color ?? '').trim()
  if (!plain) return brand
  return brand && brand.toLowerCase() !== plain.name.toLowerCase() ? `${plain.name} (${brand})` : plain.name
}

export const COLOR_FAMILIES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'Brown', 'Gray', 'Black', 'White'] as const
export type ColorFamily = (typeof COLOR_FAMILIES)[number]

/** The basic color a hex belongs to, for "show me my reds". */
export function familyOfHex(hex: string): ColorFamily {
  const { h, s, l } = toHsl(hex)
  if (l < 0.12) return 'Black'
  if (l > 0.93 || (l > 0.85 && s < 0.5 && h >= 30 && h < 70)) return 'White'
  if (s < 0.12 || (s < 0.2 && l < 0.35)) return 'Gray'
  if (h >= 10 && h < 55 && ((l < 0.45 && s < 0.75) || (s < 0.45 && l < 0.82))) return 'Brown'
  if (h < 10 || h >= 345) return l > 0.75 ? 'Pink' : 'Red'
  if (h < 40) return 'Orange'
  if (h < 66) return 'Yellow'
  if (h < 175) return 'Green'
  if (h < 250) return 'Blue'
  if (h < 302) return 'Purple'
  return 'Pink'
}

/** A supply's basic color family, or null if neither a swatch nor a color word says. */
export function supplyFamily(s: { colorHex?: string; color?: string }): ColorFamily | null {
  if (s.colorHex) return familyOfHex(s.colorHex)
  const plain = plainColor(s)
  return plain ? familyOfHex(guessHex(plain.name)) : null
}

/** True when a color name is empty or plain (one the app could have suggested), so it may be replaced. */
export function isReplaceableName(name: string | undefined): boolean {
  const n = (name ?? '').trim().replace(/\s+\d+$/, '')
  return !n || isPlainColor(n)
}
