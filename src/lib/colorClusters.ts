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

// ----- measuring the photo: patch medians, white balance, stripes -----

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s[s.length >> 1]
}

/** Median color of a small square (9×9 by default): texture and stray pixels don't move it. */
export function medianAt(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, r = 4): [number, number, number] {
  const ch: number[][] = [[], [], []]
  for (let j = Math.max(0, y - r); j <= Math.min(height - 1, y + r); j++)
    for (let i = Math.max(0, x - r); i <= Math.min(width - 1, x + r); i++) {
      const k = (j * width + i) * 4
      ch[0].push(data[k])
      ch[1].push(data[k + 1])
      ch[2].push(data[k + 2])
    }
  return [median(ch[0]), median(ch[1]), median(ch[2])]
}

export const rgbHex = (c: number[]) => `#${c.map(hex2).join('')}`

/**
 * Gains that make the photo's white read as white. Uses the brightest low-saturation pixels (a
 * white label or band) when there are enough of them; otherwise a gentle gray-world correction,
 * capped so it can't move colors by more than a few ΔE.
 */
export function autoWhiteGains(data: Uint8ClampedArray, width: number, height: number): { gains: [number, number, number]; from: 'white' | 'average' | 'none' } {
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 40000)))
  const px: [number, number, number][] = []
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if (data[i + 3] >= 128) px.push([data[i], data[i + 1], data[i + 2]])
    }
  if (!px.length) return { gains: [1, 1, 1], from: 'none' }
  const sat = (c: number[]) => (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.max(...c))
  const bright = px.filter((c) => Math.max(...c) > 170 && sat(c) < 0.3).sort((a, b) => b[0] + b[1] + b[2] - (a[0] + a[1] + a[2]))
  const clamp = (g: number) => Math.min(1.5, Math.max(0.7, g))
  if (bright.length >= px.length * 0.015) {
    const top = bright.slice(0, Math.max(5, Math.round(bright.length * 0.4)))
    const white = [0, 1, 2].map((k) => median(top.map((c) => c[k])))
    const ref = Math.max(...white)
    return { gains: white.map((v) => clamp(ref / Math.max(1, v))) as [number, number, number], from: 'white' }
  }
  // Gray world: the average of the photo should be neutral. Only nudge it.
  const mean = [0, 1, 2].map((k) => px.reduce((n, c) => n + c[k], 0) / px.length)
  const avg = (mean[0] + mean[1] + mean[2]) / 3
  let gains = mean.map((m) => clamp(avg / Math.max(1, m))) as [number, number, number]
  for (let t = 1; t > 0; t -= 0.1) {
    const g = gains.map((v) => 1 + (v - 1) * t) as [number, number, number]
    if (deltaE('#808080', rgbHex([128 * g[0], 128 * g[1], 128 * g[2]])) <= 4) {
      gains = g
      break
    }
    if (t <= 0.1) gains = [1, 1, 1]
  }
  return { gains, from: 'average' }
}

export function applyGains(data: Uint8ClampedArray, gains: [number, number, number]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i] * gains[0]
    out[i + 1] = data[i + 1] * gains[1]
    out[i + 2] = data[i + 2] * gains[2]
    out[i + 3] = data[i + 3]
  }
  return out
}

/**
 * A pack photographed edge-on shows its sheets as stripes side by side. Find them by position:
 * scan bands across the photo, find the edges where neighboring columns change color, and if the
 * edges are about evenly spaced, fit that many equal stripes and measure each one's middle. The
 * order is the pack's order. Null when there's no regular stripe pattern (fanned sheets, a pile).
 */
export function findSwatches(data: Uint8ClampedArray, width: number, height: number): FoundColor[] | null {
  let best: { score: number; colors: FoundColor[] } | null = null
  for (const vertical of [false, true]) {
    const len = vertical ? height : width
    const across = vertical ? width : height
    const at = (u: number, v: number) => ((vertical ? u * width + v : v * width + u) * 4) // u along the scan, v across it
    for (const f of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      const half = Math.max(2, Math.round(across * 0.015))
      const v0 = Math.round(across * f) - half
      const v1 = Math.round(across * f) + half
      // Median color of the band at each position along it.
      const prof: number[][] = []
      for (let u = 0; u < len; u++) {
        const ch: number[][] = [[], [], []]
        for (let v = Math.max(0, v0); v <= Math.min(across - 1, v1); v++) {
          const i = at(u, v)
          ch[0].push(data[i])
          ch[1].push(data[i + 1])
          ch[2].push(data[i + 2])
        }
        prof.push([median(ch[0]), median(ch[1]), median(ch[2])])
      }
      // Edge strength: compare small averaged windows on each side (texture and noise average out,
      // a slightly blurred edge still shows).
      const gap = Math.max(1, Math.round(len * 0.003))
      const win = Math.max(2, Math.round(len * 0.005))
      const meanHex = (a: number, b: number) => {
        const m = [0, 0, 0]
        for (let u = a; u <= b; u++) for (let k = 0; k < 3; k++) m[k] += prof[u][k] / (b - a + 1)
        return rgbHex(m)
      }
      const e = prof.map((_, u) => (u - gap - win < 0 || u + gap + win >= len ? 0 : deltaE(meanHex(u - gap - win + 1, u - gap), meanHex(u + gap, u + gap + win - 1))))
      const sortedE = [...e].sort((a, b) => a - b)
      // Above the noise: most positions aren't edges, so the middle value is the noise level.
      const threshold = Math.max(1.2, sortedE[Math.floor(sortedE.length * 0.5)] * 3)
      const minSep = Math.max(3, Math.round(len * 0.008))
      const edges: number[] = []
      for (let u = 1; u < len - 1; u++) {
        if (e[u] < threshold || e[u] < e[u - 1] || e[u] < e[u + 1]) continue
        if (edges.length && u - edges[edges.length - 1] < minSep) {
          if (e[u] > e[edges[edges.length - 1]]) edges[edges.length - 1] = u
          continue
        }
        edges.push(u)
      }
      if (edges.length < 4) continue
      const rough = median(edges.slice(1).map((u, i) => u - edges[i]))
      if (rough < minSep) continue
      // Texture can add a weak edge inside a sheet: drop edges that leave a gap under half a stripe
      // (keeping the stronger edge of the pair).
      for (let i = 1; i < edges.length; ) {
        if (edges[i] - edges[i - 1] < rough * 0.5) edges.splice(e[edges[i]] < e[edges[i - 1]] ? i : i - 1, 1)
        else i++
      }
      if (edges.length < 4) continue
      const widths = edges.slice(1).map((u, i) => u - edges[i])
      const unit = median(widths) // re-measured without the false edges
      // The longest run of gaps that are whole multiples of the stripe width (a missed edge = 2×).
      let runStart = 0
      let bestRun: [number, number] = [0, -1]
      for (let i = 0; i <= widths.length; i++) {
        const ok = i < widths.length && Math.abs(widths[i] / unit - Math.round(widths[i] / unit)) < 0.3 && Math.round(widths[i] / unit) <= 2
        if (!ok) {
          if (i - 1 - runStart > bestRun[1] - bestRun[0]) bestRun = [runStart, i - 1]
          runStart = i + 1
        }
      }
      const [r0, r1] = bestRun
      if (r1 < r0) continue
      const start = edges[r0]
      const end = edges[r1 + 1]
      const n = Math.round((end - start) / unit)
      if (n < 4) continue
      const w = (end - start) / n
      const colors: FoundColor[] = []
      for (let k = 0; k < n; k++) {
        // The middle 60% of each stripe, over the band.
        const u0 = Math.round(start + w * k + w * 0.2)
        const u1 = Math.round(start + w * (k + 1) - w * 0.2)
        const ch: number[][] = [[], [], []]
        for (let u = u0; u <= u1; u++)
          for (let v = Math.max(0, v0); v <= Math.min(across - 1, v1); v++) {
            const i = at(u, v)
            ch[0].push(data[i])
            ch[1].push(data[i + 1])
            ch[2].push(data[i + 2])
          }
        const pos = (start + w * (k + 0.5)) / len
        colors.push({ hex: rgbHex([median(ch[0]), median(ch[1]), median(ch[2])]), share: w / len, x: vertical ? f : pos, y: vertical ? pos : f, border: 0 })
      }
      // Trim stripes at either end that are really the background (they match what's beyond the
      // ends) or a white label.
      const outside = (u: number) => (u < 0 || u >= len ? null : rgbHex(prof[Math.max(0, Math.min(len - 1, u))]))
      const before = outside(Math.round(start - w * 0.6))
      const after = outside(Math.round(end + w * 0.6))
      const isEdgeJunk = (c: FoundColor) => {
        const [r, g, b] = [1, 3, 5].map((o) => parseInt(c.hex.slice(o, o + 2), 16))
        const white = Math.min(r, g, b) > 232 && Math.max(r, g, b) - Math.min(r, g, b) < 14
        return white || [before, after].some((bg) => bg && deltaE(bg, c.hex) < 6)
      }
      while (colors.length && isEdgeJunk(colors[0])) colors.shift()
      while (colors.length && isEdgeJunk(colors[colors.length - 1])) colors.pop()
      if (colors.length < 4) continue
      // Score: stripes found, minus how uneven the matched gaps were.
      const used = widths.slice(r0, r1 + 1)
      const unevenness = used.reduce((s, x) => s + Math.abs(x / unit - Math.round(x / unit)), 0) / used.length
      const score = colors.length * (1 - unevenness)
      if (!best || score > best.score) best = { score, colors }
    }
  }
  return best?.colors ?? null
}
