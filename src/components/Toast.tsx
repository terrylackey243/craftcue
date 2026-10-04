import { useEffect, useSyncExternalStore } from 'react'
import { saveSetup } from '../lib/repo'
import { addColor, getColorList, learnFromNames, setColorList } from '../lib/colorList'

// Short notes that outlive the screen that made them (e.g. "Learned: Mint" after saving and
// going back). One at a time; actions keep it up longer.

interface ToastAction {
  label: string
  run: () => void | Promise<void>
}
interface ToastMsg {
  id: number
  text: string
  actions: ToastAction[]
}

let toast: ToastMsg | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function showToast(text: string, actions: ToastAction[] = []) {
  toast = { id: ++seq, text, actions }
  emit()
}
export function hideToast() {
  toast = null
  emit()
}

async function saveList(list: ReturnType<typeof getColorList>) {
  setColorList(list)
  await saveSetup({ colorList: list })
}

/** After saving: teach the color list from renamed swatches, and say what happened. */
export async function learnAndTell(pairs: { name: string; hex?: string }[]) {
  const r = learnFromNames(getColorList(), pairs)
  if (r.learned.length) await saveList(r.list)
  if (!r.learned.length && !r.ask.length) return
  const many = r.ask.length > 3 // probably a pack's brand names: don't fill the screen with buttons
  const parts = [
    r.learned.length ? `Learned for your colors: ${r.learned.join(', ')}.` : '',
    many ? `${r.ask.length} names weren't added to your colors (they may be brand names). Add any you want in Settings → Color names.` : r.ask.length ? 'Add to your colors?' : '',
  ].filter(Boolean)
  showToast(
    parts.join(' '),
    (many ? [] : r.ask).map((a) => ({
      label: `+ ${a.name}`,
      run: async () => {
        await saveList(addColor(getColorList(), a.name, a.hex))
        showToast(`Added ${a.name} to your colors.`)
      },
    })),
  )
}

export function Toasts() {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toast,
  )
  useEffect(() => {
    if (!t) return
    const timer = setTimeout(hideToast, t.actions.length ? 20000 : 8000)
    return () => clearTimeout(timer)
  }, [t])
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-6">
      {t && (
        <div className="pointer-events-auto flex max-w-lg flex-wrap items-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-white shadow-lg">
          <span className="flex-1">{t.text}</span>
          {t.actions.map((a) => (
            <button key={a.label} type="button" className="min-h-11 rounded-xl bg-white/15 px-3 font-semibold hover:bg-white/25" onClick={() => void a.run()}>
              {a.label}
            </button>
          ))}
          <button type="button" aria-label="Dismiss" className="min-h-11 min-w-11 rounded-full text-xl hover:bg-white/15" onClick={hideToast}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
