import { useEffect, useRef, useState } from 'react'
import { loadBitmap } from '../lib/images'
import { findColors, isBackground, type FoundColor } from '../lib/colorClusters'
import PhotoDrop from './PhotoDrop'
import { Button, Sheet } from './ui'

// Picking a material's real color: Chrome's eyedropper samples anywhere on the screen (a photo
// open in Preview, a shop page…). Elsewhere (Safari, iPad) the crafter taps a photo inside the app,
// or uses the system color wheel (on a Mac its magnifier also picks anywhere on screen).

interface EyeDropperLike {
  open: () => Promise<{ sRGBHex: string }>
}
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperLike
  }
}

export const hasEyeDropper = () => typeof window !== 'undefined' && typeof window.EyeDropper === 'function'

/** Chrome's screen eyedropper. Null if the crafter pressed Esc. */
export async function eyeDropper(): Promise<string | null> {
  try {
    const r = await new window.EyeDropper!().open()
    return toHex(r.sRGBHex)
  } catch {
    return null
  }
}

/** "#abc", "rgb(1, 2, 3)" → "#aabbcc". */
export function toHex(c: string): string {
  const m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c)
  if (m) return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
  const h = c.replace('#', '').toLowerCase()
  return `#${h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6)}`
}

/** Average a small square of pixels, so paper texture and camera noise don't skew the color. */
export function averageAt(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, r = 4): string {
  let rs = 0
  let gs = 0
  let bs = 0
  let n = 0
  for (let j = Math.max(0, y - r); j <= Math.min(height - 1, y + r); j++)
    for (let i = Math.max(0, x - r); i <= Math.min(width - 1, x + r); i++) {
      const k = (j * width + i) * 4
      rs += data[k]
      gs += data[k + 1]
      bs += data[k + 2]
      n++
    }
  const hex = (v: number) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')
  return `#${hex(rs)}${hex(gs)}${hex(bs)}`
}

/**
 * White balance: scale each channel so a patch that should be white comes out white. Warm indoor
 * light makes white paper look yellow-orange in photos, which shifts every color tapped after it.
 */
export function whiteBalance(data: Uint8ClampedArray, white: [number, number, number]): Uint8ClampedArray<ArrayBuffer> {
  const gains = white.map((v) => Math.min(3, 245 / Math.max(1, v)))
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i] * gains[0]
    out[i + 1] = data[i + 1] * gains[1]
    out[i + 2] = data[i + 2] * gains[2]
    out[i + 3] = data[i + 3]
  }
  return out
}

const rgbOfHex = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** A round swatch that picks a color: eyedropper in Chrome, the photo/color-wheel sheet elsewhere. */
export function ColorSwatch({ value, onChange, label }: { value?: string; onChange: (hex: string | undefined) => void; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={value ? `Color for ${label}: ${value}. Pick again` : `Pick the color for ${label}`}
        title={hasEyeDropper() ? 'Click, then click anywhere on your screen (like a photo of the pack) to pick the color' : 'Pick the color'}
        onClick={async () => {
          if (hasEyeDropper()) {
            const hex = await eyeDropper()
            if (hex) onChange(hex)
          } else setOpen(true)
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-2 ring-stone-300 hover:ring-brand-500"
        style={value ? { background: value } : { background: 'repeating-conic-gradient(#e7e5e4 0 25%, #fff 0 50%) 0 0 / 12px 12px' }}
      >
        {!value && (
          <span aria-hidden className="text-lg">
            💧
          </span>
        )}
      </button>
      <ColorPickSheet open={open} onClose={() => setOpen(false)} targets={[label]} current={value} onPick={(_, hex) => onChange(hex)} />
    </>
  )
}

/**
 * Pick colors by tapping a photo: one color (targets = [label]), one after another (every color of
 * a pack in order), or `collect` (no names yet: each tap adds a color). Also offers the color wheel
 * for a single color.
 */
export function ColorPickSheet({
  open,
  onClose,
  targets = [],
  current,
  onPick = () => {},
  startAt = 0,
  collect = false,
  onAdd,
  photo,
}: {
  open: boolean
  onClose: () => void
  targets?: string[]
  current?: string
  onPick?: (index: number, hex: string | undefined) => void
  startAt?: number
  collect?: boolean
  onAdd?: (hex: string) => void
  /** Start with this photo already loaded (e.g. the one just used to read the pack). */
  photo?: File | null
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<ImageBitmap | HTMLImageElement | null>(null)
  const [sample, setSample] = useState<{ hex: string; x: number; y: number } | null>(null)
  const [index, setIndex] = useState(startAt)
  const [added, setAdded] = useState<string[]>([])
  // The photo as loaded, so the lighting fix can be redone or undone.
  const original = useRef<ImageData | null>(null)
  const [lighting, setLighting] = useState<'off' | 'tapWhite' | 'fixed'>('off')
  // Colors found automatically: which are ticked, and how strictly similar shades are merged.
  const [found, setFound] = useState<(FoundColor & { on: boolean })[] | null>(null)
  const [mergeAt, setMergeAt] = useState(7)

  function detect(merge = mergeAt) {
    const c = canvas.current
    const ctx = c?.getContext('2d', { willReadFrequently: true })
    if (!c || !ctx) return
    setMergeAt(merge)
    setFound(findColors(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, merge).map((f) => ({ ...f, on: !isBackground(f) })))
  }
  const single = !collect && targets.length === 1

  useEffect(() => {
    if (open) {
      setIndex(startAt)
      setSample(null)
      setAdded([])
      if (photo) void loadBitmap(photo).then(setImg)
    }
  }, [open, startAt, photo])

  useEffect(() => {
    const c = canvas.current
    if (!c || !img) return
    const w0 = 'naturalWidth' in img ? img.naturalWidth : img.width
    const h0 = 'naturalHeight' in img ? img.naturalHeight : img.height
    const scale = Math.min(1, 1200 / Math.max(w0, h0))
    c.width = Math.round(w0 * scale)
    c.height = Math.round(h0 * scale)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx?.drawImage(img, 0, 0, c.width, c.height)
    original.current = ctx ? ctx.getImageData(0, 0, c.width, c.height) : null
    setLighting('off')
    setFound(null)
  }, [img, open])

  function fixLighting(white: string) {
    const c = canvas.current
    const ctx = c?.getContext('2d', { willReadFrequently: true })
    if (!c || !ctx || !original.current) return
    ctx.putImageData(new ImageData(whiteBalance(original.current.data, rgbOfHex(white)), c.width, c.height), 0, 0)
    setLighting('fixed')
    setSample(null)
    setFound(null)
  }

  function undoLighting() {
    const ctx = canvas.current?.getContext('2d', { willReadFrequently: true })
    if (ctx && original.current) ctx.putImageData(original.current, 0, 0)
    setLighting('off')
    setSample(null)
  }

  async function openPhoto(f: File) {
    setSample(null)
    setImg(await loadBitmap(f))
  }

  function tap(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current
    const ctx = c?.getContext('2d', { willReadFrequently: true })
    if (!c || !ctx) return
    const rect = c.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * c.width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * c.height)
    if (lighting === 'tapWhite' && original.current) {
      // Measure white on the photo as it was taken, then correct the whole photo.
      fixLighting(averageAt(original.current.data, c.width, c.height, x, y, 6))
      return
    }
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    setSample({ hex: averageAt(data, c.width, c.height, x, y), x: (x / c.width) * 100, y: (y / c.height) * 100 })
  }

  function accept(hex: string | undefined) {
    if (collect) {
      if (hex) {
        onAdd?.(hex)
        setAdded((a) => [...a, hex])
      }
      setSample(null)
      return
    }
    onPick(index, hex)
    setSample(null)
    if (index + 1 < targets.length) setIndex(index + 1)
    else onClose()
  }

  const label = targets[index] ?? ''
  return (
    <Sheet open={open} onClose={onClose} title={collect ? 'Tap each color in the photo' : single ? `Color for ${label}` : 'Pick colors from a photo'}>
      <div className="flex flex-col gap-3">
        {collect && (
          <div className="flex flex-col gap-2">
            <p className="text-stone-700">Tap a color, then “Add this color”. Do it for every color in the pack, in the order you want them listed. You can name them afterwards.</p>
            {added.length > 0 && (
              <div className="flex flex-wrap items-center gap-1" aria-label={`${added.length} colors added`}>
                {added.map((h, i) => (
                  <span key={i} className="h-7 w-7 rounded-full ring-1 ring-stone-300" style={{ background: h }} />
                ))}
              </div>
            )}
          </div>
        )}
        {!single && !collect && (
          <p className="font-semibold">
            Tap {label} ({index + 1} of {targets.length})
          </p>
        )}
        {img ? (
          <div className="relative">
            <canvas ref={canvas} onPointerDown={tap} aria-label="Your photo: tap a color to pick it" className="w-full cursor-crosshair touch-none rounded-xl" />
            {sample && (
              <span
                aria-hidden
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-2 ring-black/40"
                style={{ left: `${sample.x}%`, top: `${sample.y}%`, background: sample.hex }}
              />
            )}
          </div>
        ) : (
          <PhotoDrop onFile={(f) => void openPhoto(f)}>
            <label className="inline-flex min-h-12 cursor-pointer items-center self-start rounded-xl border-2 border-brand-200 bg-white px-4 font-semibold text-brand-700">
              📷 Choose a photo of the material
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void openPhoto(e.target.files[0])} />
            </label>
          </PhotoDrop>
        )}
        {img && (
          <div className="flex flex-col gap-1">
            {lighting === 'tapWhite' ? (
              <p className="font-semibold text-brand-700">Now tap something white in the photo: white paper, a label, a wall.</p>
            ) : (
              <p className="text-sm text-stone-600">Tap the middle of a color, away from shadows and shine.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {lighting === 'fixed' ? (
                <>
                  <span className="self-center text-sm font-semibold text-green-800">✓ Lighting fixed</span>
                  <Button variant="ghost" onClick={undoLighting}>
                    Undo lighting fix
                  </Button>
                </>
              ) : lighting === 'tapWhite' ? (
                <Button variant="ghost" onClick={() => setLighting('off')}>
                  Cancel
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setLighting('tapWhite')}>
                  ⚪ Photo looks yellow or blue? Fix the lighting
                </Button>
              )}
            </div>
          </div>
        )}
        {collect && img && !found && (
          <Button variant="secondary" className="self-start" onClick={() => detect()}>
            ✨ Find the colors automatically
          </Button>
        )}
        {collect && found && (
          <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
            <p className="font-semibold">
              Found {found.length} color{found.length === 1 ? '' : 's'}. Tap any that aren't the material (like the table) to leave them out.
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Colors found in the photo">
              {found.map((f, i) => (
                <li key={`${f.hex}-${i}`}>
                  <button
                    type="button"
                    aria-pressed={f.on}
                    aria-label={`Color ${i + 1}, ${f.hex}${isBackground(f) ? ', probably the background' : ''}`}
                    onClick={() => setFound((fs) => fs!.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                    className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold ring-2 ${f.on ? 'ring-brand-600' : 'opacity-40 ring-stone-300'}`}
                    style={{ background: f.hex }}
                  >
                    {f.on ? '' : '×'}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => detect(Math.min(16, mergeAt + 3))}>
                Fewer colors
              </Button>
              <Button variant="ghost" onClick={() => detect(Math.max(2, mergeAt - 2))}>
                More colors
              </Button>
              <span className="text-sm text-stone-600">Two papers merged into one? Tap “More colors”. Shadows showing as extra colors? “Fewer colors”.</span>
            </div>
            <Button
              className="self-start"
              disabled={!found.some((f) => f.on)}
              onClick={() => {
                for (const f of found.filter((x) => x.on)) onAdd?.(f.hex)
                setFound(null)
                onClose()
              }}
            >
              Add {found.filter((f) => f.on).length} colors
            </Button>
          </div>
        )}
        {sample && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="h-12 w-12 rounded-xl ring-1 ring-stone-300" style={{ background: sample.hex }} aria-hidden />
            <Button onClick={() => accept(sample.hex)}>{collect ? 'Add this color' : `Use this for ${label}`}</Button>
          </div>
        )}
        {!single && !collect && (
          <Button variant="ghost" className="self-start" onClick={() => accept(undefined)}>
            Skip {label}
          </Button>
        )}
        {collect && (
          <Button className="self-start" variant={added.length ? 'primary' : 'secondary'} onClick={onClose}>
            {added.length ? `Done: ${added.length} color${added.length === 1 ? '' : 's'}` : 'Close'}
          </Button>
        )}
        {img && (
          <Button variant="ghost" className="self-start" onClick={() => setImg(null)}>
            Use a different photo
          </Button>
        )}
        {single && (
          <div className="flex flex-col gap-2 border-t border-stone-100 pt-3">
            <label className="flex flex-wrap items-center gap-3 font-semibold">
              Or choose from the color wheel
              <input type="color" value={current ?? '#888888'} onChange={(e) => onPick(0, e.target.value)} className="h-11 w-16 rounded" />
            </label>
            <p className="text-sm text-stone-600">On a Mac, the color wheel's magnifier 🔍 can pick a color from anywhere on your screen.</p>
            {current && (
              <Button
                variant="ghost"
                className="self-start"
                onClick={() => {
                  onPick(0, undefined)
                  onClose()
                }}
              >
                Remove the color
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
