// Geometry for cut designs. Everything is in thousandths of an inch (1000 = 1 in) so shapes can
// be unioned and offset exactly with Clipper, and exported with real-world sizes.
import ClipperLib from 'clipper-lib'
import svgpath from 'svgpath'

export const UNITS_PER_IN = 1000

export interface Pt {
  x: number
  y: number
}
/** One closed outline (or an open line for score/draw layers). */
export type Poly = Pt[]
/** A filled shape: outlines with holes, filled by the non-zero rule. */
export type Shape = Poly[]

/** Path commands, the common language of font glyphs and SVG icons. */
export type Cmd =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' }

/** Curves become short straight segments no more than `tol` from the true curve. */
export function flatten(cmds: Cmd[], tol = 2): Shape {
  const out: Shape = []
  let cur: Poly = []
  let px = 0
  let py = 0
  const steps = (len: number) => Math.min(64, Math.max(4, Math.ceil(Math.sqrt(len / tol))))
  for (const c of cmds) {
    if (c.type === 'M') {
      if (cur.length > 1) out.push(cur)
      cur = [{ x: c.x, y: c.y }]
      px = c.x
      py = c.y
    } else if (c.type === 'L') {
      cur.push({ x: c.x, y: c.y })
      px = c.x
      py = c.y
    } else if (c.type === 'Q') {
      const n = steps(Math.hypot(c.x1 - px, c.y1 - py) + Math.hypot(c.x - c.x1, c.y - c.y1))
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const u = 1 - t
        cur.push({ x: u * u * px + 2 * u * t * c.x1 + t * t * c.x, y: u * u * py + 2 * u * t * c.y1 + t * t * c.y })
      }
      px = c.x
      py = c.y
    } else if (c.type === 'C') {
      const n = steps(Math.hypot(c.x1 - px, c.y1 - py) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2))
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const u = 1 - t
        cur.push({
          x: u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          y: u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        })
      }
      px = c.x
      py = c.y
    } else if (c.type === 'Z') {
      if (cur.length > 1) out.push(cur)
      cur = []
    }
  }
  if (cur.length > 1) out.push(cur)
  return out
}

/** Parse SVG path data (any commands, including arcs) into Cmds. */
export function svgToCmds(d: string): Cmd[] {
  const cmds: Cmd[] = []
  let sx = 0
  let sy = 0
  svgpath(d)
    .abs()
    .unarc()
    .unshort()
    .iterate((seg, _i, x, y) => {
      const t = seg[0] as string
      const n = seg.slice(1) as number[]
      switch (t) {
        case 'M':
          cmds.push({ type: 'M', x: n[0], y: n[1] })
          sx = n[0]
          sy = n[1]
          break
        case 'L':
          cmds.push({ type: 'L', x: n[0], y: n[1] })
          break
        case 'H':
          cmds.push({ type: 'L', x: n[0], y })
          break
        case 'V':
          cmds.push({ type: 'L', x, y: n[0] })
          break
        case 'Q':
          cmds.push({ type: 'Q', x1: n[0], y1: n[1], x: n[2], y: n[3] })
          break
        case 'C':
          cmds.push({ type: 'C', x1: n[0], y1: n[1], x2: n[2], y2: n[3], x: n[4], y: n[5] })
          break
        case 'Z':
          cmds.push({ type: 'Z' })
          void sx
          void sy
          break
      }
    })
  return cmds
}

// ----- transforms and measuring -----

export function transform(shape: Shape, opts: { scale?: number; sx?: number; sy?: number; rotateDeg?: number; dx?: number; dy?: number; about?: Pt }): Shape {
  const sx = opts.sx ?? opts.scale ?? 1
  const sy = opts.sy ?? opts.scale ?? 1
  const a = ((opts.rotateDeg ?? 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const ox = opts.about?.x ?? 0
  const oy = opts.about?.y ?? 0
  return shape.map((poly) =>
    poly.map((p) => {
      const x = (p.x - ox) * sx
      const y = (p.y - oy) * sy
      return { x: x * cos - y * sin + ox + (opts.dx ?? 0), y: x * sin + y * cos + oy + (opts.dy ?? 0) }
    }),
  )
}

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function bbox(shape: Shape): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const poly of shape)
    for (const p of poly) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  return { minX, minY, maxX, maxY }
}

export const boxW = (b: Box) => b.maxX - b.minX
export const boxH = (b: Box) => b.maxY - b.minY

/** Move a shape so its bounding box is centered on (cx, cy). */
export function centerAt(shape: Shape, cx: number, cy: number): Shape {
  const b = bbox(shape)
  return transform(shape, { dx: cx - (b.minX + b.maxX) / 2, dy: cy - (b.minY + b.maxY) / 2 })
}

// ----- Clipper: union ("weld"), offset, cleanup -----

const toClip = (shape: Shape) => shape.map((poly) => poly.map((p) => ({ X: Math.round(p.x), Y: Math.round(p.y) })))
const fromClip = (paths: { X: number; Y: number }[][]): Shape => paths.map((poly) => poly.map((p) => ({ x: p.X, y: p.Y })))

/** Weld overlapping outlines into one shape (letters of a script font become one piece). */
export function union(...shapes: Shape[]): Shape {
  const c = new ClipperLib.Clipper()
  for (const s of shapes) if (s.length) c.AddPaths(toClip(s), ClipperLib.PolyType.ptSubject, true)
  const out: { X: number; Y: number }[][] = []
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return fromClip(ClipperLib.Clipper.CleanPolygons(out, 1.5))
}

/** The overlap of two shapes. */
export function intersection(a: Shape, b: Shape): Shape {
  const c = new ClipperLib.Clipper()
  c.AddPaths(toClip(a), ClipperLib.PolyType.ptSubject, true)
  c.AddPaths(toClip(b), ClipperLib.PolyType.ptClip, true)
  const out: { X: number; Y: number }[][] = []
  c.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return fromClip(out)
}

/** Remove `cutter` from `shape` (e.g. knock a design out of a background). */
export function difference(shape: Shape, cutter: Shape): Shape {
  const c = new ClipperLib.Clipper()
  c.AddPaths(toClip(shape), ClipperLib.PolyType.ptSubject, true)
  c.AddPaths(toClip(cutter), ClipperLib.PolyType.ptClip, true)
  const out: { X: number; Y: number }[][] = []
  c.Execute(ClipperLib.ClipType.ctDifference, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return fromClip(out)
}

/** Grow (positive) or shrink (negative) a shape by `delta`, with rounded corners. */
export function offset(shape: Shape, delta: number): Shape {
  const o = new ClipperLib.ClipperOffset(2, 1)
  o.AddPaths(toClip(union(shape)), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const out: { X: number; Y: number }[][] = []
  o.Execute(out, delta)
  return fromClip(out)
}

/** Turn open lines (like a stem) into a filled shape of the given width, with round ends. */
export function thicken(lines: Poly[], width: number): Shape {
  const o = new ClipperLib.ClipperOffset(2, 1)
  o.AddPaths(toClip(lines), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound)
  const out: { X: number; Y: number }[][] = []
  o.Execute(out, width / 2)
  return fromClip(out)
}

export function area(shape: Shape): number {
  return Math.abs(shape.reduce((sum, poly) => sum + ClipperLib.Clipper.Area(poly.map((p) => ({ X: p.x, Y: p.y }))), 0))
}

/** Outer outlines only, each with its holes: the separate pieces the machine will cut. */
export function pieces(shape: Shape): Shape[] {
  const signed = (poly: Poly) => ClipperLib.Clipper.Area(poly.map((p) => ({ X: p.x, Y: p.y })))
  if (!shape.length) return []
  // Outer outlines share the orientation of the largest outline; holes run the other way.
  const outerSign = Math.sign(signed(shape.reduce((a, b) => (Math.abs(signed(b)) > Math.abs(signed(a)) ? b : a))))
  const outers = shape.filter((p) => Math.sign(signed(p)) === outerSign)
  const holes = shape.filter((p) => Math.sign(signed(p)) !== outerSign)
  return outers.map((outer) => {
    const b = bbox([outer])
    return [outer, ...holes.filter((h) => h.every((p) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY))]
  })
}

/** Is the point inside the filled shape (non-zero winding)? */
export function insideShape(p: Pt, shape: Shape): boolean {
  let winding = 0
  for (const poly of shape)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      if (a.y <= p.y) {
        if (b.y > p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) > 0) winding++
      } else if (b.y <= p.y && (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y) < 0) winding--
    }
  return winding !== 0
}

/** Score/pen lines whose middle sits on this shape: the lines that belong to its pieces. */
export function linesOn(lines: Poly[], shape: Shape): Poly[] {
  return lines.filter((line) => {
    const mid = line[Math.floor(line.length / 2)]
    const a = line[0]
    const b = line[line.length - 1]
    const centre = line.length === 2 ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : mid
    return insideShape(centre, shape)
  })
}

// ----- SVG output -----

const fmt = (n: number) => String(Math.round(n))

export function shapeToPathD(shape: Shape): string {
  return shape.map((poly) => `M${poly.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`).join('')
}

export function linesToPathD(lines: Poly[]): string {
  return lines.map((poly) => `M${poly.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}`).join('')
}
