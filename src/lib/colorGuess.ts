// A best guess at a hex color from a craft color name ("Rocket Red", "Sour Apple", "Rose Gold").
// Used to prefill color pickers; the crafter can always correct it.

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
  ['purple', '#6a3fa0'], ['indigo', '#3f3f9f'], ['cobalt', '#1f4fbf'], ['denim', '#3d5a80'],
  ['blue', '#1e6fd0'], ['emerald', '#1f9d55'], ['kelly', '#2ca02c'], ['green', '#2e8b3e'],
]

export function guessHex(name: string | undefined): string {
  const n = (name ?? '').toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(n.trim())) return n.trim()
  return WORDS.find(([w]) => n.includes(w))?.[1] ?? '#888888'
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
