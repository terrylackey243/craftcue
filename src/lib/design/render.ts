// Draw a Design into exact outlines per layer (thousandths of an inch).
import iconData from '../../data/icons.json'
import { area, bbox, boxH, boxW, centerAt, flatten, intersection, offset, svgToCmds, thicken, transform, union, UNITS_PER_IN, type Poly, type Shape } from './geometry'
import { loadFont, textShape, type FontName } from './fonts'
import { makeShape, type ShapeName } from './shapes'
import type { Design, DesignElement, DesignLayer } from './spec'

export interface RenderedLayer extends DesignLayer {
  /** Filled outlines (cut / print layers). */
  shape: Shape
  /** Open lines (score / draw layers, e.g. leaf veins). */
  lines: Poly[]
}

export interface RenderedDesign {
  widthIn: number
  heightIn: number
  layers: RenderedLayer[]
  problems: string[]
}

const IN = UNITS_PER_IN
const icons = iconData.icons as Record<string, string[]>
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))

function placed(shape: Shape, x: number, y: number, rotationDeg: number): Shape {
  const centered = centerAt(shape, x * IN, y * IN)
  return rotationDeg ? transform(centered, { rotateDeg: rotationDeg, about: { x: x * IN, y: y * IN } }) : centered
}

function iconShape(name: string, sizeIn: number): Shape {
  const d = icons[name]
  if (!d) return []
  const raw = union(...d.map((p) => flatten(svgToCmds(p), 0.5)))
  const b = bbox(raw)
  const scale = (sizeIn * IN) / Math.max(boxW(b), boxH(b))
  return transform(raw, { scale })
}

/** A stem with leaves along it, alternating sides and shrinking toward the tip. */
function branch(el: Extract<DesignElement, { kind: 'branch' }>) {
  const h = clamp(el.heightIn, 0.5, 40) * IN
  const bend = el.curve === 'straight' ? 0 : el.curve === 'gentle' ? 0.12 : 0.22
  // Stem as a cubic curve from the base upward (before rotation).
  const P = [
    { x: 0, y: 0 },
    { x: -bend * h, y: -0.3 * h },
    { x: (el.curve === 's-curve' ? 1.4 : 0.6) * bend * h, y: -0.65 * h },
    { x: 0.1 * bend * h, y: -h },
  ]
  const at = (t: number) => {
    const u = 1 - t
    const x = u ** 3 * P[0].x + 3 * u * u * t * P[1].x + 3 * u * t * t * P[2].x + t ** 3 * P[3].x
    const y = u ** 3 * P[0].y + 3 * u * u * t * P[1].y + 3 * u * t * t * P[2].y + t ** 3 * P[3].y
    const dx = 3 * u * u * (P[1].x - P[0].x) + 6 * u * t * (P[2].x - P[1].x) + 3 * t * t * (P[3].x - P[2].x)
    const dy = 3 * u * u * (P[1].y - P[0].y) + 6 * u * t * (P[2].y - P[1].y) + 3 * t * t * (P[3].y - P[2].y)
    return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
  }
  const stemLine: Poly = Array.from({ length: 60 }, (_, i) => at(i / 59))
  const stem = thicken([stemLine], Math.max(80, h * 0.012))
  const count = Math.round(clamp(el.leafCount, 2, 40))
  const maxLen = clamp(el.leafLengthIn, 0.3, 10) * IN
  const leaves: Shape[] = []
  const veins: Poly[] = []
  for (let i = 0; i < count; i++) {
    const t = 0.1 + (0.85 * i) / Math.max(1, count - 1)
    const p = at(t)
    const side = i % 2 === 0 ? -1 : 1
    const len = maxLen * (1 - 0.5 * (i / Math.max(1, count - 1)))
    const width = el.leafShape === 'leaf-round' ? len * 0.8 : el.leafShape === 'leaf-olive' ? len * 0.3 : len * 0.42
    // Leaf drawn pointing up with its base at the origin, then turned out from the stem.
    const leafShape = transform(makeShape(el.leafShape as ShapeName, width, len), { dy: -len / 2 })
    const rot = p.angle + 90 + side * 50
    leaves.push(transform(leafShape, { rotateDeg: rot, dx: p.x, dy: p.y }))
    if (el.leafShape !== 'leaf-round') {
      const vein: Poly = [{ x: 0, y: -len * 0.1 }, { x: 0, y: -len * 0.85 }]
      veins.push(transform([vein], { rotateDeg: rot, dx: p.x, dy: p.y })[0])
    }
  }
  // Tip leaf
  const tip = at(1)
  leaves.push(transform(transform(makeShape(el.leafShape as ShapeName, maxLen * 0.2, maxLen * 0.45), { dy: -maxLen * 0.225 }), { rotateDeg: tip.angle + 90, dx: tip.x, dy: tip.y }))
  // Rotate the whole branch, then put its base at (x, y).
  const place = (s: Shape) => transform(s, { rotateDeg: el.rotationDeg, dx: el.x * IN, dy: el.y * IN })
  return { stem: place(stem), leaves: leaves.map(place), veins: place(veins) }
}

export async function renderDesign(design: Design): Promise<RenderedDesign> {
  const problems: string[] = []
  const layers = new Map<string, RenderedLayer>()
  for (const l of design.layers) layers.set(l.id, { ...l, shape: [], lines: [] })
  // Separate things on one layer that touch get welded into one piece; remember them to check.
  const drawn: { layer: string; label: string; shape: Shape; isText: boolean }[] = []
  const add = (id: string, shape: Shape) => {
    const layer = layers.get(id)
    if (!layer) return problems.push(`A piece refers to a layer that doesn't exist (${id}).`)
    layer.shape.push(...shape)
  }

  for (const el of design.elements) {
    if (el.kind === 'text') {
      if (!el.text.trim()) continue
      const font = await loadFont(el.font as FontName)
      const s = placed(textShape(font, el.text, clamp(el.capHeightIn, 0.15, 20) * IN, clamp(el.letterSpacing, -0.1, 0.5)), el.x, el.y, el.rotationDeg)
      drawn.push({ layer: el.layer, label: `the words “${el.text}”`, shape: s, isText: true })
      add(el.layer, s)
    } else if (el.kind === 'shape') {
      const s = placed(makeShape(el.shape, clamp(el.widthIn, 0.1, 60) * IN, clamp(el.heightIn, 0.1, 60) * IN), el.x, el.y, el.rotationDeg)
      drawn.push({ layer: el.layer, label: `the ${el.shape.replace('-', ' ')}`, shape: s, isText: false })
      add(el.layer, s)
    } else if (el.kind === 'icon') {
      const s = placed(iconShape(el.icon, clamp(el.sizeIn, 0.2, 40)), el.x, el.y, el.rotationDeg)
      drawn.push({ layer: el.layer, label: `the ${el.icon.replace('-', ' ')}`, shape: s, isText: false })
      add(el.layer, s)
    } else if (el.kind === 'branch') {
      const b = branch(el)
      add(el.stemLayer, b.stem)
      const leafLayers = el.leafLayers.length ? el.leafLayers : [el.stemLayer]
      b.leaves.forEach((leaf, i) => add(leafLayers[i % leafLayers.length], leaf))
      if (el.veinLayer && layers.has(el.veinLayer)) layers.get(el.veinLayer)!.lines.push(...b.veins)
    }
  }

  // Words touching something else of the same color would be cut as one lump.
  for (let i = 0; i < drawn.length; i++)
    for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i]
      const b = drawn[j]
      if (a.layer !== b.layer || !(a.isText || b.isText)) continue
      // Under 0.1 in apart is too close to cut and weed cleanly, and touching welds them together.
      if (area(intersection(offset(a.shape, 100), b.shape)) > 0) problems.push(`${a.label[0].toUpperCase()}${a.label.slice(1)} and ${b.label} are touching or almost touching on the same layer. Leave at least 0.15 in between them so they cut and weed as separate pieces.`)
    }

  // Weld each layer (overlaps inside one color become one piece), then trace outlines.
  for (const layer of layers.values()) if (layer.operation !== 'score' && layer.operation !== 'draw') layer.shape = union(layer.shape)
  for (const el of design.elements) {
    if (el.kind !== 'outline') continue
    const traced = el.of.flatMap((id) => layers.get(id)?.shape ?? [])
    if (!traced.length) continue
    add(el.layer, offset(traced, clamp(el.distanceIn, 0.02, 2) * IN))
    const layer = layers.get(el.layer)
    if (layer) layer.shape = union(layer.shape)
  }

  // Anything drawn outside the canvas?
  const W = design.widthIn * IN
  const H = design.heightIn * IN
  for (const layer of layers.values()) {
    const all = [...layer.shape, ...layer.lines]
    if (!all.length) continue
    const b = bbox(all)
    if (b.minX < -0.05 * IN || b.minY < -0.05 * IN || b.maxX > W + 0.05 * IN || b.maxY > H + 0.05 * IN) problems.push(`Part of the “${layer.name}” layer goes past the edge of the ${design.widthIn} × ${design.heightIn} in design.`)
  }

  return { widthIn: design.widthIn, heightIn: design.heightIn, layers: [...layers.values()], problems }
}
