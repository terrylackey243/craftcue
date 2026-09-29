// The design format. Claude fills it in (structured output); CraftCue draws it (render.ts).
// Positions are the CENTER of each element, in inches from the top-left of the canvas.
import { z } from 'zod/v4'
import iconData from '../../data/icons.json'
import { FONT_NAMES } from './fonts'
import { SHAPES } from './shapes'

export const ICON_NAMES = Object.keys(iconData.icons) as [string, ...string[]]

export const PRODUCTS = ['wall-art', 'sign', 'card', 'mug', 'tumbler', 't-shirt', 'tote', 'pillow', 'banner', 'sticker-sheet', 'decal', 'label', 'gift-tag', 'ornament', 'other'] as const
export type Product = (typeof PRODUCTS)[number]

const layerRef = z.string().describe('id of one of the layers')

export const TextEl = z.object({
  kind: z.literal('text'),
  layer: layerRef,
  text: z.string().describe('one line of text; use a separate element per line'),
  font: z.enum(FONT_NAMES as [string, ...string[]]),
  capHeightIn: z.number().describe('height of a capital letter, in inches'),
  x: z.number(),
  y: z.number(),
  rotationDeg: z.number(),
  letterSpacing: z.number().describe('extra space between letters in em, usually 0; 0.05–0.2 opens up block capitals'),
})

export const ShapeEl = z.object({
  kind: z.literal('shape'),
  layer: layerRef,
  shape: z.enum(SHAPES),
  x: z.number(),
  y: z.number(),
  widthIn: z.number(),
  heightIn: z.number(),
  rotationDeg: z.number(),
})

export const IconEl = z.object({
  kind: z.literal('icon'),
  layer: layerRef,
  icon: z.enum(ICON_NAMES),
  x: z.number(),
  y: z.number(),
  sizeIn: z.number(),
  rotationDeg: z.number(),
})

export const BranchEl = z.object({
  kind: z.literal('branch'),
  stemLayer: layerRef,
  leafLayers: z.array(layerRef).describe('leaf colors, used in turn'),
  veinLayer: z.string().describe('id of a score layer for leaf veins, or "" for none'),
  x: z.number().describe('stem base x'),
  y: z.number().describe('stem base y'),
  heightIn: z.number(),
  rotationDeg: z.number().describe('0 = growing straight up'),
  leafShape: z.enum(['leaf-pointed', 'leaf-round', 'leaf-olive']),
  leafCount: z.number(),
  leafLengthIn: z.number().describe('length of the largest (lowest) leaf'),
  curve: z.enum(['straight', 'gentle', 's-curve']),
})

export const OutlineEl = z.object({
  kind: z.literal('outline'),
  layer: layerRef,
  of: z.array(layerRef).describe('layers whose combined outline is traced'),
  distanceIn: z.number().describe('how far outside them, e.g. 0.125 for a backing/shadow layer or sticker edge'),
})

export const ElementSchema = z.discriminatedUnion('kind', [TextEl, ShapeEl, IconEl, BranchEl, OutlineEl])
export type DesignElement = z.infer<typeof ElementSchema>

export const LayerSchema = z.object({
  id: z.string(),
  name: z.string().describe('what the crafter sees, e.g. "Rocket Red cardstock"'),
  supplyId: z.string().describe('the supply id from the stash, or "" if it is printed or not from the stash'),
  color: z.string().describe('hex color like #c0392b, close to the real material'),
  operation: z.enum(['cut', 'score', 'draw', 'print']),
})
export type DesignLayer = z.infer<typeof LayerSchema>

export const DesignSchema = z.object({
  title: z.string(),
  product: z.enum(PRODUCTS),
  mode: z.enum(['cut', 'print-then-cut']),
  widthIn: z.number(),
  heightIn: z.number(),
  layers: z.array(LayerSchema).describe('bottom to top'),
  elements: z.array(ElementSchema),
  assembly: z.array(z.string()).describe('short steps to put the cut pieces together'),
})
/** Ready-made outlines on a layer (from vector artwork), in thousandths of an inch. */
export interface ArtPiece {
  layer: string
  d: string
}
/**
 * A saved design. `art` and `artPrompt` are only set on designs made from illustrated vector
 * artwork (the Recraft add-on); Claude never writes them.
 */
export type Design = z.infer<typeof DesignSchema> & { art?: ArtPiece[]; artPrompt?: string }
