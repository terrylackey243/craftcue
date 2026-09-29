// Turn vector artwork (e.g. from Recraft) into cut layers: one welded shape per chosen color.
import { area, bbox, boxH, boxW, difference, flatten, pieces, svgToCmds, transform, union, UNITS_PER_IN, type Shape } from './geometry'

type Matrix = [number, number, number, number, number, number] // a b c d e f

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

function parseTransform(t: string | null): Matrix {
  let m: Matrix = IDENTITY
  if (!t) return m
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number)
    let n: Matrix = IDENTITY
    if (fn === 'matrix' && v.length === 6) n = v as Matrix
    else if (fn === 'translate') n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]
    else if (fn === 'scale') n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]
    else if (fn === 'rotate') {
      const a = ((v[0] ?? 0) * Math.PI) / 180
      const r: Matrix = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]
      n = v.length === 3 ? mul(mul([1, 0, 0, 1, v[1], v[2]], r), [1, 0, 0, 1, -v[1], -v[2]]) : r
    }
    m = mul(m, n)
  }
  return m
}

const apply = (shape: Shape, m: Matrix): Shape => shape.map((poly) => poly.map((p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })))

function elementPath(el: Element): string | null {
  const n = (a: string) => Number(el.getAttribute(a) ?? 0)
  switch (el.tagName.toLowerCase()) {
    case 'path':
      return el.getAttribute('d')
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')]
      return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
    }
    case 'circle': {
      const [cx, cy, r] = [n('cx'), n('cy'), n('r')]
      return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`
    }
    case 'ellipse': {
      const [cx, cy, rx, ry] = [n('cx'), n('cy'), n('rx'), n('ry')]
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
    }
    case 'polygon':
    case 'polyline': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number)
      if (pts.length < 4) return null
      let d = `M${pts[0]} ${pts[1]}`
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
      return el.tagName.toLowerCase() === 'polygon' ? `${d}Z` : d
    }
  }
  return null
}

function fillOf(el: Element, inherited: string | null): string | null {
  const style = el.getAttribute('style') ?? ''
  const fromStyle = /fill\s*:\s*([^;]+)/.exec(style)?.[1]?.trim()
  const f = fromStyle ?? el.getAttribute('fill') ?? inherited
  return f && f !== 'none' && f !== 'transparent' ? f : null
}

export function cssToRgb(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase()
  if (c.startsWith('#')) {
    const h = c.slice(1)
    const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6)
    const n = parseInt(full, 16)
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null
  }
  const m = /rgba?\(([^)]+)\)/.exec(c)
  if (m) {
    const [r, g, b] = m[1].split(',').map((v) => parseFloat(v))
    return [r, g, b]
  }
  if (c === 'white') return [255, 255, 255]
  if (c === 'black') return [0, 0, 0]
  return null
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export interface ImportedLayer {
  color: string // one of the chosen colors
  shape: Shape // thousandths of an inch
}

/**
 * Parse vector art and map every filled shape to the nearest chosen color, keeping paint order:
 * layers come out bottom to top as they were painted (how layered vinyl stacks). A white shape
 * covering the whole artwork is the background and is dropped; other white details (unless white
 * is a chosen color) become cut-outs in whatever is under them. The artwork is scaled so its
 * larger side is `sizeIn` and centered at (cx, cy) inches.
 */
export function importVectorArt(svgText: string, chosen: string[], sizeIn: number, cx: number, cy: number): ImportedLayer[] {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.tagName.toLowerCase() !== 'svg') throw new Error('That artwork could not be read.')
  const palette = chosen.map((c) => ({ color: c, rgb: cssToRgb(c) ?? [0, 0, 0] }))
  const whiteChosen = palette.some((p) => dist(p.rgb, [255, 255, 255]) < 40)

  // 1. Every filled shape in paint order, in the SVG's own units.
  const painted: { shape: Shape; rgb: [number, number, number] }[] = []
  const walk = (el: Element, m: Matrix, fill: string | null) => {
    const tag = el.tagName.toLowerCase()
    if (['defs', 'clippath', 'mask', 'style', 'title', 'metadata'].includes(tag)) return
    const here = mul(m, parseTransform(el.getAttribute('transform')))
    const f = fillOf(el, fill)
    const d = elementPath(el)
    const rgb = f ? cssToRgb(f) : null
    if (d && rgb) painted.push({ shape: apply(flatten(svgToCmds(d), 0.25), here), rgb })
    for (const child of Array.from(el.children)) walk(child, here, f)
  }
  walk(svg, IDENTITY, null)

  // 2. A white shape covering the whole artwork is the background, not part of the design.
  const isWhite = (rgb: number[]) => dist(rgb, [255, 255, 255]) < 40
  const whole = painted.length ? bbox(painted.flatMap((p) => p.shape)) : null
  const art = painted.filter((p) => {
    if (!whole || !isWhite(p.rgb)) return true
    const pb = bbox(p.shape)
    return !(boxW(pb) >= boxW(whole) * 0.9 && boxH(pb) >= boxH(whole) * 0.9)
  })
  if (!art.some((p) => !isWhite(p.rgb) || whiteChosen)) return []

  // 3. Scale to thousandths of an inch first, so welding and cut-outs keep fine detail.
  const b = bbox(art.flatMap((p) => p.shape))
  const scale = (sizeIn * UNITS_PER_IN) / Math.max(boxW(b), boxH(b))
  const place = (sh: Shape) => transform(sh, { scale, dx: cx * UNITS_PER_IN - ((b.minX + b.maxX) / 2) * scale, dy: cy * UNITS_PER_IN - ((b.minY + b.maxY) / 2) * scale })

  // 4. Build layers in paint order.
  const order: string[] = []
  const layers = new Map<string, Shape>()
  for (const p of art) {
    if (isWhite(p.rgb) && !whiteChosen) {
      const hole = place(p.shape)
      for (const [color, shape] of layers) layers.set(color, difference(union(shape), hole))
      continue
    }
    const nearest = palette.reduce((a, c) => (dist(c.rgb, p.rgb) < dist(a.rgb, p.rgb) ? c : a))
    if (!layers.has(nearest.color)) order.push(nearest.color)
    layers.set(nearest.color, [...(layers.get(nearest.color) ?? []), ...place(p.shape)])
  }

  return order
    .map((color) => {
      // Weld, and drop specks too small to cut (under ~0.04 in across).
      const kept = pieces(union(layers.get(color)!)).filter((piece) => {
        const pb = bbox(piece)
        return Math.max(boxW(pb), boxH(pb)) >= 40 && area(piece) > 400
      })
      return { color, shape: kept.flat() }
    })
    .filter((l) => l.shape.length)
}
