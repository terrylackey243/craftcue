import { describe, expect, it } from 'vitest'
import { findColors, isBackground } from '../../src/lib/colorClusters'
import { deltaE } from '../../src/lib/colorList'

// 20 paper colors in vertical strips on a gray table, with shadows on each strip and camera noise.
const PAPER = ['#c62828', '#e8501e', '#f57c00', '#f9d71c', '#f3e28a', '#8bc34a', '#2e8b3e', '#1e5631', '#30c5c0', '#1b8a8a', '#87ceeb', '#1e6fd0', '#1f2a56', '#8c9ce8', '#6a3fa0', '#b8a2d8', '#f58cb5', '#d0308f', '#7b4b2a', '#d2b48c']
function photo(): { data: Uint8ClampedArray; w: number; h: number } {
  const w = 400
  const h = 240
  const data = new Uint8ClampedArray(w * h * 4)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 8
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let rgb = [128, 128, 124] // table
      const strip = Math.floor((x - 20) / 18)
      if (y > 30 && y < 210 && x >= 20 && strip < 20 && (x - 20) % 18 < 16) {
        const n = parseInt(PAPER[strip].slice(1), 16)
        const shade = y > 180 ? 0.85 : 1 // a soft shadow near the bottom of each strip
        rgb = [((n >> 16) & 255) * shade, ((n >> 8) & 255) * shade, (n & 255) * shade]
      }
      const i = (y * w + x) * 4
      data[i] = rgb[0] + rand()
      data[i + 1] = rgb[1] + rand()
      data[i + 2] = rgb[2] + rand()
      data[i + 3] = 255
    }
  return { data, w, h }
}

describe('finding the colors in a photo of a pack', () => {
  it('finds all 20 papers in left-to-right order, plus the table marked as background', () => {
    const { data, w, h } = photo()
    const found = findColors(data, w, h)
    const papers = found.filter((c) => !isBackground(c))
    const table = found.filter(isBackground)
    expect(table).toHaveLength(1)
    expect(papers).toHaveLength(20)
    papers.forEach((c, i) => expect(deltaE(c.hex, PAPER[i])).toBeLessThan(6))
  })

  it('a looser setting merges similar colors', () => {
    const { data, w, h } = photo()
    expect(findColors(data, w, h, 14).length).toBeLessThan(findColors(data, w, h, 7).length)
  })
})
