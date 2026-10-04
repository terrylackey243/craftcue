// Find the distinct colors in a photo of paper or vinyl (e.g. a fanned-out pack): group the pixels
// with k-means in Lab (how eyes see color), merge groups that look like the same material (shadow
// and shine), drop specks, and guess which group is the background from how much of the edge it
// covers.
import { deltaE } from './colorList'

export interface FoundColor {
  hex: string
  /** Share of the photo, 0–1. */
  share: number
  /** Center of the color in the photo, 0–1 (for left-to-right order). */
  x: number
  y: number
  /** Share of the photo's outer edge this color covers; a lot means it's probably the background. */
  border: number
}

type Lab = [number, number, number]

function srgbToLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')

/**
 * @param data RGBA pixels, @param width/height their size.
 * @param mergeAt how different two groups may look and still be one color (CIEDE2000; ~5 strict,
 * ~12 loose).
 */
export function findColors(data: Uint8ClampedArray, width: number, height: number, mergeAt = 7): FoundColor[] {
  // Sample up to ~25,000 pixels on a grid.
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 25000)))
  const px: { lab: Lab; rgb: [number, number, number]; x: number; y: number; edge: boolean }[] = []
  const edgeX = width * 0.04
  const edgeY = height * 0.04
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 128) continue
      const rgb: [number, number, number] = [data[i], data[i + 1], data[i + 2]]
      px.push({ lab: srgbToLab(...rgb), rgb, x: x / width, y: y / height, edge: x < edgeX || y < edgeY || x >= width - edgeX || y >= height - edgeY })
    }
  if (!px.length) return []

  // k-means with a deterministic spread-out start (farthest-point), more groups than needed.
  const k = Math.min(36, px.length)
  const d2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const centers: Lab[] = [px[Math.floor(px.length / 2)].lab]
  const nearest = px.map((p) => d2(p.lab, centers[0]))
  while (centers.length < k) {
    let far = 0
    for (let i = 1; i < px.length; i++) if (nearest[i] > nearest[far]) far = i
    if (nearest[far] < 4) break // everything is already close to a center
    centers.push(px[far].lab)
    for (let i = 0; i < px.length; i++) nearest[i] = Math.min(nearest[i], d2(px[i].lab, px[far].lab))
  }
  const label = new Array<number>(px.length).fill(0)
  for (let iter = 0; iter < 12; iter++) {
    for (let i = 0; i < px.length; i++) {
      let best = 0
      for (let c = 1; c < centers.length; c++) if (d2(px[i].lab, centers[c]) < d2(px[i].lab, centers[best])) best = c
      label[i] = best
    }
    const sums = centers.map(() => [0, 0, 0, 0])
    px.forEach((p, i) => {
      const s = sums[label[i]]
      s[0] += p.lab[0]
      s[1] += p.lab[1]
      s[2] += p.lab[2]
      s[3]++
    })
    sums.forEach((s, c) => {
      if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
    })
  }

  // Summarize each group in sRGB (average of its pixels), with where it sits.
  type Group = { r: number; g: number; b: number; n: number; x: number; y: number; edge: number }
  let groups: Group[] = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0, x: 0, y: 0, edge: 0 }))
  px.forEach((p, i) => {
    const g = groups[label[i]]
    g.r += p.rgb[0]
    g.g += p.rgb[1]
    g.b += p.rgb[2]
    g.x += p.x
    g.y += p.y
    g.n++
    if (p.edge) g.edge++
  })
  groups = groups.filter((g) => g.n > 0)
  const hexOf = (g: Group) => `#${hex2(g.r / g.n)}${hex2(g.g / g.n)}${hex2(g.b / g.n)}`

  // Merge groups that look like the same material, closest pairs first.
  for (;;) {
    let pair: [number, number] | null = null
    let bestD = mergeAt
    for (let a = 0; a < groups.length; a++)
      for (let b = a + 1; b < groups.length; b++) {
        // Light vs dark counts less: shadow and shine on the same sheet are one color.
        const d = deltaE(hexOf(groups[a]), hexOf(groups[b]), 2.5)
        if (d < bestD) {
          bestD = d
          pair = [a, b]
        }
      }
    if (!pair) break
    const [a, b] = pair
    const A = groups[a]
    const B = groups[b]
    groups[a] = { r: A.r + B.r, g: A.g + B.g, b: A.b + B.b, n: A.n + B.n, x: A.x + B.x, y: A.y + B.y, edge: A.edge + B.edge }
    groups.splice(b, 1)
  }

  const edgeTotal = px.filter((p) => p.edge).length || 1
  return groups
    .map((g) => ({ hex: hexOf(g), share: g.n / px.length, x: g.x / g.n, y: g.y / g.n, border: g.edge / edgeTotal }))
    .filter((c) => c.share >= 0.004) // specks, edges between colors
    .sort((a, b) => a.x - b.x || a.y - b.y)
}

/** Probably the table, wall or mat behind the material. */
export const isBackground = (c: FoundColor) => c.border > 0.3
