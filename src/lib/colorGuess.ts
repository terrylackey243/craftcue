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
