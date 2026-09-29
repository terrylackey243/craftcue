// Client-side image handling. Thumbnails (~400px) are stored; larger copies are only ever sent to
// the vision model and then discarded (spec 3.3, 8.2).

export interface Compressed {
  dataUrl: string
  base64: string
  mediaType: 'image/jpeg'
  width: number
  height: number
}

export async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older Safari: fall back to <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function compressImage(file: Blob, longEdge: number, quality: number): Promise<Compressed> {
  const src = await loadBitmap(file)
  const w0 = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h0 = 'naturalHeight' in src ? src.naturalHeight : src.height
  const scale = Math.min(1, longEdge / Math.max(w0, h0))
  const width = Math.max(1, Math.round(w0 * scale))
  const height = Math.max(1, Math.round(h0 * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process photos.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(src, 0, 0, width, height)
  if ('close' in src) src.close()
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg', width, height }
}

export const makeThumbnail = (file: Blob) => compressImage(file, 400, 0.7)
export const makeVisionImage = (file: Blob) => compressImage(file, 1568, 0.85)
