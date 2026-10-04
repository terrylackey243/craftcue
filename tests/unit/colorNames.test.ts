import { describe, expect, it } from 'vitest'
import { nameOfHex } from '../../src/lib/colorGuess'

// The swatches Terry picked from a pack photo (read off his screenshot), plus everyday colors.
describe('plain names for picked colors', () => {
  it.each([
    ['#f0e08a', 'Light yellow'], // was "Peach"
    ['#f1dc80', 'Light yellow'],
    ['#ecc860', 'Yellow'],
    ['#c8c04a', 'Yellow'],
    ['#b89434', 'Gold'],
    ['#f4c4a0', 'Peach'],
    ['#dc7c48', 'Orange'],
    ['#a05c30', 'Brown'],
    ['#cce0e0', 'Light aqua'], // was "Ivory"
    ['#e0e8f4', 'Pale blue'], // was "Ivory 2"
    ['#b0c4e0', 'Light blue'],
    ['#c62828', 'Red'],
    ['#1e6fd0', 'Blue'],
    ['#1f2a56', 'Navy'],
    ['#2e8b3e', 'Green'],
    ['#6a3fa0', 'Purple'],
    ['#f58cb5', 'Pink'],
    ['#1a1a1a', 'Black'],
    ['#ffffff', 'White'],
    ['#8a8a8a', 'Gray'],
    ['#d2b48c', 'Tan'],
    ['#5a3622', 'Dark brown'],
    ['#ff4fa0', 'Hot pink'],
    ['#fbe3ea', 'Pale pink'],
  ])('%s → %s', (hex, name) => expect(nameOfHex(hex)).toBe(name))
})
