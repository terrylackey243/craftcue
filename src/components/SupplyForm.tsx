import { useMemo, useState } from 'react'
import { useCategories } from '../hooks'
import { addCategory, saveSupply } from '../lib/repo'
import { makeThumbnail } from '../lib/images'
import { ADHESIVES, UNITS, type Supply } from '../types'
import { Button, Chip, Field, Notice, Stepper, fieldClass, inputClass } from './ui'
import { guessCategory } from '../lib/guessCategory'

export type SupplyDraft = Partial<Supply> & { name: string; category: string; quantity: number; unit: Supply['unit'] }

export function emptyDraft(category = 'adhesive-vinyl'): SupplyDraft {
  return { name: '', category, quantity: 1, unit: 'sheet', source: 'manual' }
}

const UNIT_LABELS: Record<string, string> = {
  sheet: 'sheets',
  roll: 'rolls',
  ft: 'feet',
  yd: 'yards',
  piece: 'pieces',
  pack: 'packs',
  blank: 'blanks',
  bottle: 'bottles',
  other: 'other',
}
const SINGULAR: Record<string, string> = { sheet: 'sheet', roll: 'roll', ft: 'foot', yd: 'yard', piece: 'piece', pack: 'pack', blank: 'blank', bottle: 'bottle' }

/** Plural label for pickers ("sheets"), or the right form for a count when `n` is given. */
export const unitLabel = (u: string, n?: number) => (n === 1 && SINGULAR[u] ? SINGULAR[u] : (UNIT_LABELS[u] ?? u))

/** "1 sheet", "2.5 feet", "0.25 sheet". */
export const formatQty = (n: number, u: string) => `${Math.round(n * 1000) / 1000} ${unitLabel(u, n)}`

/**
 * The one supply form every intake path ends in (spec 8). `uncertain` highlights fields the user
 * should double-check (from a photo or a barcode miss).
 */
export default function SupplyForm({
  initial,
  uncertain = {},
  onSaved,
  onCancel,
  saveLabel = 'Save supply',
  onDelete,
}: {
  initial: SupplyDraft
  uncertain?: Partial<Record<keyof Supply, string>>
  onSaved: (s: Supply) => void
  onCancel?: () => void
  saveLabel?: string
  onDelete?: () => void
}) {
  const categories = useCategories()
  const [d, setD] = useState<SupplyDraft>(initial)
  const [more, setMore] = useState(Boolean(initial.brand || initial.location || initial.unitCost || initial.notes || initial.upc))
  const [error, setError] = useState('')
  const [newCat, setNewCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const cat = useMemo(() => categories.find((c) => c.id === d.category), [categories, d.category])

  const set = <K extends keyof SupplyDraft>(k: K, v: SupplyDraft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }))
    setTouched((t) => new Set(t).add(k as string))
  }
  // Once the user edits a flagged field, stop highlighting it.
  const flag = (k: keyof Supply) => (touched.has(k as string) ? undefined : uncertain[k])

  function chooseCategory(id: string) {
    const c = categories.find((x) => x.id === id)
    setD((prev) => ({
      ...prev,
      category: id,
      unit: c && !c.units.includes(prev.unit) ? c.units[0] : prev.unit,
      adhesive: prev.adhesive ?? c?.defaultAdhesive,
    }))
    setTouched((t) => new Set(t).add('category'))
  }

  function chooseCategoryQuietly(id: string) {
    const c = categories.find((x) => x.id === id)
    setD((prev) => ({ ...prev, category: id, unit: c && !c.units.includes(prev.unit) ? c.units[0] : prev.unit, adhesive: c?.defaultAdhesive }))
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return
    try {
      const t = await makeThumbnail(file)
      set('thumbnail', t.dataUrl)
    } catch {
      setError("Couldn't use that photo. Try a different one.")
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!d.name.trim()) {
      setError('Please give it a name, like “Glossy permanent vinyl”.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveSupply({
        ...d,
        name: d.name.trim(),
        source: d.source ?? 'manual',
        unitCost: d.unitCost === undefined || Number.isNaN(d.unitCost) ? undefined : d.unitCost,
      } as Supply)
      onSaved(saved)
    } catch {
      setError("Couldn't save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {Object.keys(uncertain).length > 0 && (
        <Notice tone="warn">We filled this in for you. Please check the highlighted boxes before saving.</Notice>
      )}

      <Field label="Type of supply" highlight={flag('category')}>
        {(id) => (
          <select id={id} className={inputClass} value={d.category} onChange={(e) => chooseCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <details className="-mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-brand-700">Don't see your type? Add one</summary>
        <div className="mt-2 flex gap-2">
          <label htmlFor="new-cat" className="sr-only">
            New type name
          </label>
          <input id="new-cat" className={inputClass} value={newCat} placeholder="e.g. Resin molds" onChange={(e) => setNewCat(e.target.value)} />
          <Button
            variant="secondary"
            disabled={!newCat.trim()}
            onClick={async () => {
              const c = await addCategory(newCat)
              setNewCat('')
              chooseCategory(c.id)
            }}
          >
            Add
          </Button>
        </div>
      </details>

      <Field label="Name" highlight={flag('name')} hint="Something you'll recognise, like “Glossy permanent vinyl” or “White 15 oz mugs”.">
        {(id) => (
          <input
            id={id}
            className={inputClass}
            value={d.name}
            autoComplete="off"
            onChange={(e) => set('name', e.target.value)}
            onBlur={() => {
              // Guess the type from the name unless the user already chose one on purpose.
              if (touched.has('category') || initial.id) return
              const guess = guessCategory(d.name)
              if (guess && guess !== d.category && categories.some((c) => c.id === guess)) chooseCategoryQuietly(guess)
            }}
          />
        )}
      </Field>

      {cat?.subtypes && cat.subtypes.length > 0 && (
        <div>
          <p className="mb-2 font-semibold">Kind</p>
          <div className="flex flex-wrap gap-2">
            {cat.subtypes.map((s) => (
              <Chip key={s} selected={d.subtype === s} onClick={() => set('subtype', d.subtype === s ? undefined : s)}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Color" highlight={flag('color')}>
          {(id) => <input id={id} className={inputClass} value={d.color ?? ''} placeholder="e.g. matte black" onChange={(e) => set('color', e.target.value || undefined)} />}
        </Field>
        <Field label="Finish">
          {(id) => (
            <input id={id} className={inputClass} list="finish-list" value={d.finish ?? ''} placeholder="matte, glossy, glitter…" onChange={(e) => set('finish', e.target.value || undefined)} />
          )}
        </Field>
        <datalist id="finish-list">
          {['matte', 'glossy', 'glitter', 'metallic', 'holographic', 'shimmer', 'pearl', 'textured', 'clear'].map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>

      <Field label="Size" highlight={flag('dimensions')}>
        {(id) => (
          <>
            <input id={id} className={inputClass} value={d.dimensions ?? ''} placeholder="e.g. 12 x 12 in" onChange={(e) => set('dimensions', e.target.value || undefined)} />
            {cat && cat.sizes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {cat.sizes.map((s) => (
                  <Chip key={s} selected={d.dimensions === s} onClick={() => set('dimensions', s)}>
                    {s}
                  </Chip>
                ))}
              </div>
            )}
          </>
        )}
      </Field>

      <div className={`flex flex-col gap-2 ${flag('quantity') ? 'rounded-xl bg-sun-300/40 p-2 ring-2 ring-sun-500' : ''}`}>
        <p className="font-semibold">How many do you have?</p>
        <div className="flex flex-wrap items-center gap-3">
          <Stepper label="quantity" value={d.quantity} onChange={(n) => set('quantity', n)} step={d.unit === 'ft' || d.unit === 'yd' ? 0.5 : 1} />
          <label htmlFor="unit" className="sr-only">
            Unit
          </label>
          <select id="unit" className={`${fieldClass} w-auto`} value={d.unit} onChange={(e) => set('unit', e.target.value as Supply['unit'])}>
            {[...(cat?.units ?? []), ...UNITS.filter((u) => !cat?.units.includes(u))].map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </div>
        {flag('quantity') && <p className="text-sm font-medium text-amber-900">⚠ {flag('quantity')}</p>}
      </div>

      <Field label="Adhesive / backing">
        {(id) => (
          <select id={id} className={inputClass} value={d.adhesive ?? ''} onChange={(e) => set('adhesive', (e.target.value || undefined) as Supply['adhesive'])}>
            <option value="">Not sure / doesn't apply</option>
            {ADHESIVES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <p className="font-semibold">Photo (optional)</p>
        <div className="flex items-center gap-3">
          {d.thumbnail && <img src={d.thumbnail} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-stone-200" />}
          <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border-2 border-brand-200 bg-white px-4 font-semibold text-brand-700">
            {d.thumbnail ? 'Change photo' : 'Add a photo'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {d.thumbnail && (
            <Button variant="ghost" onClick={() => set('thumbnail', undefined)}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <button type="button" className="self-start font-semibold text-brand-700 underline" onClick={() => setMore(!more)} aria-expanded={more}>
        {more ? 'Fewer details' : 'More details (brand, where it is, cost…)'}
      </button>

      {more && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand" highlight={flag('brand')}>
            {(id) => <input id={id} className={inputClass} value={d.brand ?? ''} onChange={(e) => set('brand', e.target.value || undefined)} />}
          </Field>
          <Field label="Where it's kept" hint="e.g. craft room, bin 3">
            {(id) => <input id={id} className={inputClass} value={d.location ?? ''} onChange={(e) => set('location', e.target.value || undefined)} />}
          </Field>
          <Field label={`Cost per ${d.unit === 'other' ? 'unit' : d.unit} ($)`}>
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className={inputClass}
                value={d.unitCost ?? ''}
                onChange={(e) => set('unitCost', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            )}
          </Field>
          <Field label="Warn me when I'm down to" hint="Shows a “low” badge and adds it to the shopping list.">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className={inputClass}
                value={d.lowAt ?? ''}
                placeholder="1"
                onChange={(e) => set('lowAt', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            )}
          </Field>
          <Field label="Barcode (UPC)">
            {(id) => <input id={id} inputMode="numeric" className={inputClass} value={d.upc ?? ''} onChange={(e) => set('upc', e.target.value.replace(/\D/g, '') || undefined)} />}
          </Field>
          <Field label="Notes">
            {(id) => <textarea id={id} rows={2} className={`${inputClass} py-2`} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} />}
          </Field>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving} className="min-h-14 flex-1 text-lg">
          {saveLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {onDelete && (
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </form>
  )
}
