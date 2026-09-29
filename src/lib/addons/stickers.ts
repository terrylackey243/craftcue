// Sticker sheets for Print Then Cut: transparent art gets a white border and is laid out on a
// sheet that fits Design Space's Print Then Cut limit. Design Space cuts around each sticker.
import { PRINT_THEN_CUT_MAX } from '../design/checks'
import { loadBitmap } from '../images'

export const STICKER_DPI = 300
const GAP_IN = 0.25

export interface Slot {
  x: number // inches, top-left of the sticker's square
  y: number
}

/** How many stickers of `sizeIn` fit on a Print Then Cut sheet, and where. */
export function layoutSheet(sizeIn: number, sheet = { w: PRINT_THEN_CUT_MAX.w, h: PRINT_THEN_CUT_MAX.h }): Slot[] {
  const cols = Math.floor((sheet.w + GAP_IN) / (sizeIn + GAP_IN))
  const rows = Math.floor((sheet.h + GAP_IN) / (sizeIn + GAP_IN))
  const slots: Slot[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ x: c * (sizeIn + GAP_IN), y: r * (sizeIn + GAP_IN) })
  return slots
}

/**
 * Draw `art` into a `px` square with a white border `borderPx` wide around its shape: stamp a white
 * silhouette in a ring of offsets (a cheap outward grow), then the art on top.
 */
export function drawWithBorder(ctx: CanvasRenderingContext2D, art: CanvasImageSource, x: number, y: number, px: number, borderPx: number) {
  const inner = px - 2 * borderPx
  const sil = document.createElement('canvas')
  sil.width = sil.height = px
  const s = sil.getContext('2d')!
  s.drawImage(art, borderPx, borderPx, inner, inner)
  s.globalCompositeOperation = 'source-in'
  s.fillStyle = '#ffffff'
  s.fillRect(0, 0, px, px)
  const steps = 32
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    ctx.drawImage(sil, x + Math.cos(a) * borderPx, y + Math.sin(a) * borderPx)
  }
  ctx.drawImage(sil, x, y)
  ctx.drawImage(art, x + borderPx, y + borderPx, inner, inner)
}

/** A 300 dpi PNG sheet, cycling through the chosen stickers to fill every slot. */
export async function renderSheet(images: string[], sizeIn: number, borderIn = 0.08): Promise<Blob> {
  const slots = layoutSheet(sizeIn)
  if (!slots.length || !images.length) throw new Error('Nothing to put on the sheet.')
  const bitmaps = await Promise.all(images.map(async (src) => loadBitmap(await (await fetch(src)).blob())))
  const w = Math.max(...slots.map((s) => s.x)) + sizeIn
  const h = Math.max(...slots.map((s) => s.y)) + sizeIn
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * STICKER_DPI)
  canvas.height = Math.round(h * STICKER_DPI)
  const ctx = canvas.getContext('2d')!
  const px = Math.round(sizeIn * STICKER_DPI)
  slots.forEach((slot, i) => drawWithBorder(ctx, bitmaps[i % bitmaps.length], slot.x * STICKER_DPI, slot.y * STICKER_DPI, px, Math.round(borderIn * STICKER_DPI)))
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('This browser could not make the sheet.')
  return blob
}

/** Shrink generated art to a data URL small enough to store and sync (WebP keeps transparency). */
export async function toStoredImage(png: Blob, longEdge = 768): Promise<string> {
  const src = await loadBitmap(png)
  const w0 = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h0 = 'naturalHeight' in src ? src.naturalHeight : src.height
  const scale = Math.min(1, longEdge / Math.max(w0, h0))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w0 * scale)
  canvas.height = Math.round(h0 * scale)
  canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height)
  const webp = canvas.toDataURL('image/webp', 0.85)
  // Browsers that can't make WebP (older Safari) give PNG instead; keep that but smaller.
  if (webp.startsWith('data:image/webp') || longEdge <= 512) return webp
  return toStoredImage(png, 512)
}
