import { describe, expect, it } from 'vitest'
import { applyGains, autoWhiteGains, findColors, findSwatches, medianAt } from '../../src/lib/colorClusters'
import { colorFamilyOf, deltaE } from '../../src/lib/colorList'

// A stand-in for the Recollections "Printed Cardstock Neutral" pack shot edge-on: 20 sheets as
// stripes, six of them close yellows, a white label band across the top, a wood table around it,
// paper texture, light falling off to the right, and soft edges between sheets.
export const NEUTRAL = [
  '#f6eeb4', '#f2e39a', '#ecd77e', '#e3c866', '#d6b84e', '#c8a83c', // six yellows, light to dark
  '#f3e9cc', '#e3d3b4', '#d2b48c', '#c8a47e', '#c19a6b', '#8a5a35', '#6f4e37', '#3c3429', // cream … espresso
  '#9caf88', '#7a7d60', '#7f9a99', '#6a7fa0', '#8a8a8a', '#404244', // sage, olive sage, slate teal, slate blue, gray, charcoal
]

export function packPhoto(cast: [number, number, number] = [1, 1, 1]) {
  const w = 600
  const h = 360
  const data = new Uint8ClampedArray(w * h * 4)
  let seed = 11
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 12
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const x0 = 60
  const sw = 24
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = [139, 107, 74] // wood table
      const inPack = x >= x0 && x < x0 + sw * 20 && y > 30 && y < 330
      if (inPack && y < 80) c = [244, 244, 242] // white label band
      else if (inPack) {
        const k = Math.floor((x - x0) / sw)
        const t = (x - x0) % sw
        c = rgb(NEUTRAL[k])
        if (t === 0 && k > 0) c = c.map((v, i) => (v + rgb(NEUTRAL[k - 1])[i]) / 2) // soft edge
      }
      const light = 1 - 0.1 * (x / w)
      const i = (y * w + x) * 4
      for (let ch = 0; ch < 3; ch++) data[i + ch] = c[ch] * light * cast[ch] + noise()
      data[i + 3] = 255
    }
  return { data, w, h }
}

describe('finding a pack’s colors by position', () => {
  it('finds all 20 sheets in pack order, including six close yellows', () => {
    const { data, w, h } = packPhoto()
    const found = findSwatches(data, w, h)!
    expect(found).toHaveLength(20)
    found.forEach((c, i) => expect(deltaE(c.hex, NEUTRAL[i])).toBeLessThan(6))
    // Clustering alone merges the yellows: the reason stripes are found by position first.
    expect(findColors(data, w, h).length).toBeLessThan(22)
  })

  it('a warm color cast, corrected by the white label, keeps every sheet in its color family', () => {
    const { data, w, h } = packPhoto([1, 0.92, 0.78])
    const { gains, from } = autoWhiteGains(data, w, h)
    expect(from).toBe('white')
    const found = findSwatches(applyGains(data, gains), w, h)!
    expect(found).toHaveLength(20)
    found.forEach((c, i) => expect(colorFamilyOf(c.hex)).toBe(colorFamilyOf(NEUTRAL[i])))
  })

  it('returns nothing for a photo without stripes, and samples a patch median when tapped', () => {
    const w = 100
    const h = 100
    const flat = new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : 128))
    expect(findSwatches(flat, w, h)).toBeNull()
    flat[(50 * w + 50) * 4] = 255 // one stray pixel doesn't move a 9×9 median
    expect(medianAt(flat, w, h, 50, 50)).toEqual([128, 128, 128])
  })
})
