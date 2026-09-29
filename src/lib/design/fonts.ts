// Bundled open-license fonts (public/fonts; licenses in public/licenses). Text is converted to
// outlines with opentype.js, so designs cut exactly the same on every device and in Design Space.
import { parse, type Font } from 'opentype.js'
import { flatten, union, type Cmd, type Shape } from './geometry'

export const FONTS = {
  'Bebas Neue': { file: 'BebasNeue-Regular.ttf', note: 'tall, narrow capitals only; modern, clean; great for signs and shirts' },
  Anton: { file: 'Anton-Regular.ttf', note: 'bold condensed sans; strong and readable at small sizes' },
  'Alfa Slab One': { file: 'AlfaSlabOne-Regular.ttf', note: 'heavy slab serif; farmhouse and vintage signs' },
  'Abril Fatface': { file: 'AbrilFatface-Regular.ttf', note: 'elegant bold serif with thin parts; keep it large (1 in+ capitals)' },
  'Luckiest Guy': { file: 'LuckiestGuy-Regular.ttf', note: 'chunky playful capitals; kids, Halloween, fun' },
  Chewy: { file: 'Chewy-Regular.ttf', note: 'bouncy rounded letters; kids and casual' },
  'Sniglet ExtraBold': { file: 'Sniglet-ExtraBold.ttf', note: 'soft rounded bold; friendly, easy to weed' },
  Rye: { file: 'Rye-Regular.ttf', note: 'western/rustic decorative; keep it large' },
  Lobster: { file: 'Lobster-Regular.ttf', note: 'bold connected script; welds into one piece' },
  Pacifico: { file: 'Pacifico-Regular.ttf', note: 'rounded retro script; welds into one piece' },
  'Oleo Script': { file: 'OleoScript-Bold.ttf', note: 'heavy connected script; very cuttable' },
  Cookie: { file: 'Cookie-Regular.ttf', note: 'light brush script; use only for large words (1.5 in+)' },
} as const
export type FontName = keyof typeof FONTS
export const FONT_NAMES = Object.keys(FONTS) as FontName[]

type Loader = (file: string) => Promise<ArrayBuffer>
let loader: Loader = async (file) => {
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`)
  if (!res.ok) throw new Error(`Couldn't load the ${file} font.`)
  return res.arrayBuffer()
}
/** Tests read fonts from disk instead of fetching them. */
export function setFontLoader(l: Loader) {
  loader = l
}

const cache = new Map<FontName, Promise<Font>>()
export function loadFont(name: FontName): Promise<Font> {
  let p = cache.get(name)
  if (!p) {
    p = loader(FONTS[name].file).then(parse)
    cache.set(name, p)
  }
  return p
}

/** Height of a capital letter as a fraction of the font size. */
function capHeightRatio(font: Font): number {
  const fromTable = font.tables.os2?.sCapHeight
  if (fromTable && fromTable > 0) return fromTable / font.unitsPerEm
  const box = font.charToGlyph('H').getBoundingBox()
  return (box.y2 - box.y1) / font.unitsPerEm || 0.7
}

/**
 * Text as a welded outline, sized so capital letters are `capHeight` tall (thousandths of an inch),
 * with its top-left near (0, 0). Overlapping letters (script fonts) become one piece.
 */
export function textShape(font: Font, text: string, capHeight: number, letterSpacingEm = 0): Shape {
  const size = capHeight / capHeightRatio(font)
  const path = font.getPath(text, 0, size, size, { kerning: true, letterSpacing: letterSpacingEm })
  const cmds = path.commands.map((c) => ({ ...c })) as unknown as Cmd[]
  return union(flatten(cmds, 1.5))
}
