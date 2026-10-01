import { useEffect, useRef, useState, type ReactNode } from 'react'

/** The first picture in a drop or paste (a copied screenshot, a file from Finder, an image from a page). */
export function imageFrom(dt: DataTransfer | null): File | null {
  if (!dt) return null
  const file = Array.from(dt.files ?? []).find((f) => f.type.startsWith('image/'))
  if (file) return file
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  return null
}

const hasFiles = (dt: DataTransfer | null) => Boolean(dt && Array.from(dt.types).includes('Files'))
const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent)

/**
 * Wraps a "choose a photo" button so a picture can also be dragged onto it or pasted (⌘V / Ctrl+V
 * anywhere on the screen, or the Paste button). Phones and tablets keep just the button.
 */
export default function PhotoDrop({ onFile, children, disabled = false, compact = false }: { onFile: (f: File) => void; children: ReactNode; disabled?: boolean; compact?: boolean }) {
  const [over, setOver] = useState(false)
  const [msg, setMsg] = useState('')
  const latest = useRef(onFile)
  latest.current = onFile

  useEffect(() => {
    if (disabled) return
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return
      const f = imageFrom(e.clipboardData)
      if (!f) return // ordinary text paste: leave it alone
      e.preventDefault()
      setMsg('')
      latest.current(f)
    }
    // A picture dropped just outside the box shouldn't make the browser open it instead.
    const stray = (e: DragEvent) => {
      if (hasFiles(e.dataTransfer)) e.preventDefault()
    }
    document.addEventListener('paste', onPaste)
    window.addEventListener('dragover', stray)
    window.addEventListener('drop', stray)
    return () => {
      document.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', stray)
      window.removeEventListener('drop', stray)
    }
  }, [disabled])

  async function pasteButton() {
    setMsg('')
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) {
          const blob = await item.getType(type)
          latest.current(new File([blob], `pasted.${type.split('/')[1] || 'png'}`, { type }))
          return
        }
      }
      setMsg('There’s no picture copied. Copy one first (or take a screenshot), then paste.')
    } catch {
      setMsg(`Your browser didn’t allow that. Press ${isMac ? '⌘V' : 'Ctrl+V'} instead.`)
    }
  }

  return (
    <div
      data-testid="photo-drop"
      className={`flex flex-col gap-2 rounded-2xl ${compact ? '' : 'border-2 border-dashed p-3 pointer-coarse:border-0 pointer-coarse:p-0'} ${over ? 'border-brand-600 bg-brand-50' : 'border-stone-300'}`}
      onDragEnter={(e) => {
        if (!disabled && hasFiles(e.dataTransfer)) setOver(true)
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e.dataTransfer)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (disabled) return
        const f = imageFrom(e.dataTransfer)
        if (f) {
          setMsg('')
          onFile(f)
        } else setMsg('That isn’t a picture. Try a JPG or PNG photo.')
      }}
    >
      {children}
      {!disabled && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-stone-600 pointer-coarse:hidden">
          {over ? (
            <strong className="text-brand-700">Let go to use this picture</strong>
          ) : (
            <>
              <span>…or drag a picture here, or paste one ({isMac ? '⌘V' : 'Ctrl+V'})</span>
              {typeof navigator !== 'undefined' && 'clipboard' in navigator && 'read' in navigator.clipboard && (
                <button type="button" className="min-h-10 rounded-lg px-2 font-semibold text-brand-700 underline" onClick={() => void pasteButton()}>
                  📋 Paste
                </button>
              )}
            </>
          )}
        </p>
      )}
      {msg && (
        <p role="status" className="text-sm font-medium text-amber-900">
          {msg}
        </p>
      )}
    </div>
  )
}
