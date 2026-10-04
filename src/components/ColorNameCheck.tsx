import { useState } from 'react'
import { useColorList } from '../hooks'
import { nameOfHex } from '../lib/colorGuess'
import { addColor, closestColors, matchColor } from '../lib/colorList'
import { Button, fieldClass } from './ui'

/**
 * Shown under a picked color that isn't close to anything on the crafter's color list: add it as
 * a new color, or say which color it really is (that shade is then remembered for that name).
 */
export default function ColorNameCheck({ hex, onName }: { hex: string; onName?: (name: string) => void }) {
  const [list, save] = useColorList()
  const [name, setName] = useState(() => nameOfHex(hex))
  if (matchColor(hex, list)) return null
  const options = closestColors(hex, list).slice(0, 8)
  const choose = async (n: string) => {
    onName?.(n)
    await save(addColor(list, n, hex))
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200" role="group" aria-label="Color not on your list">
      <p className="flex items-center gap-2 text-sm text-amber-900">
        <span className="inline-block h-5 w-5 shrink-0 rounded-full ring-1 ring-stone-300" style={{ background: hex }} aria-hidden />
        This shade isn't close to any color on your list.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`new-color-${hex}`}>
          Name for the new color
        </label>
        <input id={`new-color-${hex}`} className={`${fieldClass} w-44`} value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="secondary" disabled={!name.trim()} onClick={() => void choose(name)}>
          Add to my colors
        </Button>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-700">
        Or it's really:
        <select className={`${fieldClass} w-auto`} value="" onChange={(e) => e.target.value && void choose(e.target.value)}>
          <option value="">Pick the right color…</option>
          {options.map((m) => (
            <option key={m.entry.name} value={m.entry.name}>
              {m.entry.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
