// Minimal types for the parts of these libraries CraftCue uses.

declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'Q' | 'C' | 'Z'
    x?: number
    y?: number
    x1?: number
    y1?: number
    x2?: number
    y2?: number
  }
  export interface Path {
    commands: PathCommand[]
  }
  export interface Glyph {
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number }
  }
  export interface Font {
    unitsPerEm: number
    ascender: number
    descender: number
    tables: { os2?: { sCapHeight?: number } }
    getPath(text: string, x: number, y: number, fontSize: number, options?: { kerning?: boolean; letterSpacing?: number }): Path
    charToGlyph(ch: string): Glyph
  }
  export function parse(buffer: ArrayBuffer): Font
}

declare module 'clipper-lib' {
  interface IntPoint {
    X: number
    Y: number
  }
  type Path = IntPoint[]
  type Paths = Path[]
  class Clipper {
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean
    Execute(clipType: number, solution: Paths, subjFill: number, clipFill: number): boolean
    static SimplifyPolygons(polys: Paths, fillType: number): Paths
    static CleanPolygons(polys: Paths, distance?: number): Paths
    static Area(poly: Path): number
  }
  class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number)
    AddPaths(paths: Paths, joinType: number, endType: number): void
    Execute(solution: Paths, delta: number): void
  }
  const ClipperLib: {
    Clipper: typeof Clipper
    ClipperOffset: typeof ClipperOffset
    PolyType: { ptSubject: number; ptClip: number }
    ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number }
    PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number }
    JoinType: { jtSquare: number; jtRound: number; jtMiter: number }
    EndType: { etClosedPolygon: number; etClosedLine: number; etOpenButt: number; etOpenSquare: number; etOpenRound: number }
  }
  export default ClipperLib
}
