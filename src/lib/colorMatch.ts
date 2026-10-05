// "Brown cardstock" → a brown cardstock in the stash, whatever it's called ("Dirt", "Tan 4").
// Matched by color family and hex (colorSatisfies), plus the material words, never the color name.
import { colorSatisfies, wantedHex } from './colorGuess'
import { deltaE } from './colorList'
import { supplyHex } from './colorGuess'
import type { Supply } from '../types'

const IGNORE = new Set(['more', 'some', 'sheet', 'sheets', 'piece', 'pieces', 'pack', 'color', 'colour', 'light', 'dark', 'pale', 'with', 'from', 'your', 'extra', 'small', 'large', 'plain'])
const words = (t: string) =>
  t
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !IGNORE.has(w))
    .map((w) => w.replace(/s$/, ''))

/** The in-stock supply that gives the color and material a request asks for, closest color first. */
export function stashMatchFor(wanted: string, supplies: Supply[]): Supply | null {
  const want = wantedHex(wanted)
  if (!want) return null
  const need = words(wanted)
  const candidates = supplies.filter((s) => {
    if (s.quantity <= 0 || !colorSatisfies(wanted, s)) return false
    if (!need.length) return true
    const have = new Set(words([s.name, s.subtype, s.category, s.setName].filter(Boolean).join(' ')))
    return need.some((w) => have.has(w))
  })
  return candidates.sort((a, b) => deltaE(supplyHex(a), want) - deltaE(supplyHex(b), want))[0] ?? null
}
