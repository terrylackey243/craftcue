// Built-in cut shapes. Each returns a Shape centered on (0, 0), sized in thousandths of an inch.
import type { Poly, Shape } from './geometry'

export const SHAPES = [
  'circle',
  'oval',
  'rectangle',
  'rounded-rectangle',
  'heart',
  'star',
  'hexagon',
  'triangle',
  'pennant',
  'banner',
  'scallop-circle',
  'scallop-rectangle',
  'leaf-pointed',
  'leaf-round',
  'leaf-olive',
  'tag',
] as const
export type ShapeName = (typeof SHAPES)[number]

/** Short descriptions the design model sees, so it picks the right one. */
export const SHAPE_NOTES: Record<ShapeName, string> = {
  circle: 'circle (width = diameter)',
  oval: 'ellipse',
  rectangle: 'plain rectangle, good for backgrounds and sign boards',
  'rounded-rectangle': 'rectangle with rounded corners, good for labels and plaques',
  heart: 'heart',
  star: 'five-point star',
  hexagon: 'hexagon',
  triangle: 'triangle pointing up',
  pennant: 'triangle flag pointing down, for bunting/banners (one letter each)',
  banner: 'ribbon banner with notched ends, for a word across it',
  'scallop-circle': 'circle with scalloped edge, good as a layered backing',
  'scallop-rectangle': 'rectangle with scalloped edge',
  'leaf-pointed': 'pointed oval leaf (base at bottom), for botanicals',
  'leaf-round': 'round eucalyptus-style leaf',
  'leaf-olive': 'long slim olive leaf',
  tag: 'gift tag with a hole near the top',
}

const circlePoly = (rx: number, ry: number, n = 96): Poly => Array.from({ length: n }, (_, i) => ({ x: rx * Math.cos((2 * Math.PI * i) / n), y: ry * Math.sin((2 * Math.PI * i) / n) }))

function roundedRect(w: number, h: number, r: number): Poly {
  r = Math.min(r, w / 2, h / 2)
  const pts: Poly = []
  const corner = (cx: number, cy: number, start: number) => {
    for (let i = 0; i <= 12; i++) {
      const a = start + (Math.PI / 2) * (i / 12)
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
  }
  corner(w / 2 - r, h / 2 - r, 0)
  corner(-w / 2 + r, h / 2 - r, Math.PI / 2)
  corner(-w / 2 + r, -h / 2 + r, Math.PI)
  corner(w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2)
  return pts
}

function scalloped(base: Poly, bumps: number, depth: number): Poly {
  // Push each point outward by a rounded bump pattern along the perimeter.
  const n = base.length
  let perim = 0
  const lens: number[] = []
  for (let i = 0; i < n; i++) {
    const a = base[i]
    const b = base[(i + 1) % n]
    lens.push(perim)
    perim += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return base.map((p, i) => {
    const prev = base[(i - 1 + n) % n]
    const next = base[(i + 1) % n]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = ty / len
    const ny = -tx / len
    const phase = ((lens[i] / perim) * bumps) % 1
    const bump = Math.sqrt(Math.max(0, 1 - (2 * phase - 1) ** 2)) * depth
    return { x: p.x + nx * bump, y: p.y + ny * bump }
  })
}

function leaf(len: number, width: number, pointiness = 0.9): Poly {
  // Base at (0, len/2), tip at (0, -len/2): two mirrored curves.
  const pts: Poly = []
  const n = 40
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const y = len / 2 - t * len
    const x = (width / 2) * Math.sin(Math.PI * t) ** pointiness
    pts.push({ x, y })
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n
    pts.push({ x: -(width / 2) * Math.sin(Math.PI * t) ** pointiness, y: len / 2 - t * len })
  }
  return pts
}

export function makeShape(name: ShapeName, w: number, h: number): Shape {
  switch (name) {
    case 'circle':
      return [circlePoly(w / 2, w / 2)]
    case 'oval':
      return [circlePoly(w / 2, h / 2)]
    case 'rectangle':
      return [[{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }]]
    case 'rounded-rectangle':
      return [roundedRect(w, h, Math.min(w, h) * 0.15)]
    case 'heart': {
      const pts: Poly = []
      for (let i = 0; i < 120; i++) {
        const t = (2 * Math.PI * i) / 120
        pts.push({ x: 16 * Math.sin(t) ** 3, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) })
      }
      return [pts.map((p) => ({ x: (p.x / 34) * w, y: (p.y / 31) * h }))]
    }
    case 'star': {
      const pts: Poly = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.4
        const a = -Math.PI / 2 + (Math.PI * i) / 5
        pts.push({ x: (w / 2) * r * Math.cos(a), y: (h / 2) * r * Math.sin(a) + h * 0.05 })
      }
      return [pts]
    }
    case 'hexagon':
      return [Array.from({ length: 6 }, (_, i) => ({ x: (w / 2) * Math.cos((Math.PI / 3) * i), y: (h / 2) * Math.sin((Math.PI / 3) * i) }))]
    case 'triangle':
      return [[{ x: 0, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }]]
    case 'pennant':
      return [[{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: 0, y: h / 2 }]]
    case 'banner': {
      const notch = Math.min(w * 0.08, h * 0.45)
      return [[{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2 - notch, y: 0 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }, { x: -w / 2 + notch, y: 0 }]]
    }
    case 'scallop-circle': {
      const bumps = Math.max(8, Math.round((Math.PI * w) / 450))
      return [scalloped(circlePoly(w / 2 - w * 0.03, w / 2 - w * 0.03, bumps * 16), bumps, w * 0.03)]
    }
    case 'scallop-rectangle': {
      const d = Math.min(w, h) * 0.04
      const bumps = Math.max(12, Math.round((2 * (w + h)) / 450))
      return [scalloped(roundedRect(w - 2 * d, h - 2 * d, d), bumps, d)]
    }
    case 'leaf-pointed':
      return [leaf(h, w, 0.9)]
    case 'leaf-round':
      return [circlePoly(w / 2, h / 2)]
    case 'leaf-olive':
      return [leaf(h, w, 0.6)]
    case 'tag': {
      const r = Math.min(w, h) * 0.08
      const body = roundedRect(w, h, Math.min(w, h) * 0.12)
      const hole = circlePoly(r, r, 40)
        .map((p) => ({ x: p.x, y: p.y - h / 2 + r * 3 }))
        .reverse()
      return [body, hole]
    }
  }
}
