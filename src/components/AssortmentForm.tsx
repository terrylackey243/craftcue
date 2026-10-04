import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCategories, useSetup } from '../hooks'
import { addAnotherPack, cleanColors, costPerUnit, findSamePack, parseColorList, saveAssortment, totalCount } from '../lib/assortment'
import { formatMoney, parseMoney } from '../lib/money'
import { makeVisionImage } from '../lib/images'
import { friendlyError } from '../lib/ai/aiClient'
import { cacheUpc } from '../lib/repo'
import { db } from '../db'
import { isValidUpc, normalizeUpc } from '../lib/upc'
import { UNITS, type PackColor, type Supply } from '../types'
import { unitLabel } from './SupplyForm'
import { useAiGate } from './useAiGate'
import BarcodeField from './BarcodeField'
import { Button, Chip, Field, Notice, Spinner, Stepper, fieldClass, inputClass } from './ui'
import PhotoDrop from './PhotoDrop'
import { ColorPickSheet, ColorSwatch, hasEyeDropper } from './ColorPick'
import { nameForHex } from '../lib/colorList'
import ColorNameCheck from './ColorNameCheck'
import { isReplaceableName } from '../lib/colorGuess'
import { learnAndTell } from './Toast'

export interface AssortmentInitial {
  name?: string
  setName?: string
  category?: string
  brand?: string
  subtype?: string
  dimensions?: string
  unit?: Supply['unit']
  colors?: PackColor[]
  upc?: string
  countsUncertain?: boolean
}

interface Row extends PackColor {
  key: number
}

let rowKey = 0
const toRows = (colors: PackColor[] = []): Row[] => colors.map((c) => ({ ...c, key: ++rowKey }))

/** Enter a pack that holds several colors; saves one stash item per color, linked as a set. */
export default function AssortmentForm({ initial = {}, onSaved, onCancel }: { initial?: AssortmentInitial; onSaved: (saved: Supply[]) => void; onCancel?: () => void }) {
  const categories = useCategories()
  const setup = useSetup()
  const { guard, panel } = useAiGate()
  const photoRef = useRef<HTMLInputElement>(null)
  const [f, setF] = useState({
    name: initial.name ?? '',
    setName: initial.setName ?? '',
    category: initial.category ?? 'cardstock-paper',
    brand: initial.brand ?? '',
    subtype: initial.subtype ?? '',
    dimensions: initial.dimensions ?? '',
    unit: initial.unit ?? ('sheet' as Supply['unit']),
    upc: initial.upc ?? '',
  })
  const [rows, setRows] = useState<Row[]>(toRows(initial.colors?.length ? initial.colors : [{ color: '', count: 1 }]))
  const [countsUncertain, setCountsUncertain] = useState(Boolean(initial.countsUncertain))
  const [same, setSame] = useState(3)
  const [packs, setPacks] = useState(1)
  const [price, setPrice] = useState('')
  const [pasting, setPasting] = useState(false)
  // Chosen when the picker opens: names typed → tap them in order; no names → each tap adds a color.
  const [picking, setPicking] = useState<false | 'collect' | 'sequence'>(false)
  const [lastPhoto, setLastPhoto] = useState<File | null>(null)
  /** Set when the photo had no readable color names: explains, and offers tapping the colors. */
  const [noNames, setNoNames] = useState<string | false>(false)
  const [namesAreGuesses, setNamesAreGuesses] = useState(false)
  const [pasted, setPasted] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const cat = useMemo(() => categories.find((c) => c.id === f.category), [categories, f.category])
  const colors = cleanColors(rows)
  const total = totalCount(colors)
  const perUnit = costPerUnit(colors, parseMoney(price))
  const one = unitLabel(f.unit, 1)
  const many = unitLabel(f.unit)

  const setRow = (key: number, patch: Partial<PackColor>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  // Drag handles: finger (iPad), mouse, or keyboard (space to pick up, arrows to move).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setRows((rs) => arrayMove(rs, rs.findIndex((r) => r.key === active.id), rs.findIndex((r) => r.key === over.id)))
  }
  const labelOf = (r: Row, i: number) => r.color || `color ${i + 1}`
  const [focusKey, setFocusKey] = useState<number | null>(null)
  const addAfter = (i: number, count: number) => {
    const key = ++rowKey
    setRows((rs) => [...rs.slice(0, i + 1), { color: '', count, key }, ...rs.slice(i + 1)])
    setFocusKey(key)
  }

  /** A color tapped on a photo with no names yet: add it as a row with a plain suggested name. */
  function addPicked(hex: string) {
    setRows((rs) => {
      const named = rs.filter((r) => r.color.trim())
      const taken = new Set(named.map((r) => r.color.trim().toLowerCase()))
      const base = nameForHex(hex)
      let name = base
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`
      return [...named, { color: name, hex, count: same || 1, key: ++rowKey }]
    })
    setNamesAreGuesses(true)
  }

  async function readPhoto(file: File | undefined) {
    if (!file || !setup) return
    setLastPhoto(file)
    setNoNames(false)
    setReading(true)
    setError('')
    try {
      const { readAssortmentPhoto } = await import('../lib/ai/vision')
      const r = await readAssortmentPhoto(await makeVisionImage(file), categories, setup.quality)
      setF((prev) => ({
        ...prev,
        name: r.name || prev.name,
        setName: r.setName || prev.setName,
        brand: r.brand || prev.brand,
        category: r.category || prev.category,
        subtype: r.subtype || prev.subtype,
        dimensions: r.dimensions || prev.dimensions,
        unit: r.unit || prev.unit,
        upc: prev.upc || r.upcDigits,
      }))
      if (r.colors.length) setRows(toRows(r.colors.map((c) => ({ color: c.color, count: c.count > 0 ? c.count : 1 }))))
      setCountsUncertain(!r.countsConfident || r.colors.some((c) => !(c.count > 0)))
      if (!r.colors.length)
        setNoNames(
          r.totalCount > 0
            ? `We read ${r.totalCount} ${unitLabel(r.unit || f.unit, r.totalCount)} but couldn't read the color names clearly. If no names are printed, tap each color on the photo instead.`
            : "We couldn't read any color names on that photo. If no names are printed, tap each color on the photo instead, or type them in.",
        )
    } catch (e) {
      setError(friendlyError(e).message)
    } finally {
      setReading(false)
    }
  }

  // A ref, not state: it blocks a second tap even before React re-renders the disabled button.
  const inFlight = useRef(false)
  const [done, setDone] = useState<{ saved: Supply[]; addedTo?: boolean } | null>(null)
  const [dupe, setDupe] = useState<Supply[] | null>(null)
  const top = useRef<HTMLDivElement>(null)

  function finish(result: { saved: Supply[]; addedTo?: boolean }) {
    setDone(result)
    setDupe(null)
    onSaved(result.saved)
    requestAnimationFrame(() => top.current?.scrollIntoView?.({ block: 'center' }))
  }

  function reset() {
    setDone(null)
    setF({ name: '', setName: '', category: f.category, brand: '', subtype: '', dimensions: '', unit: f.unit, upc: '' })
    setRows(toRows([{ color: '', count: 1 }]))
    setPrice('')
    setPacks(1)
    setCountsUncertain(false)
  }

  async function addToExisting(existing: Supply[]) {
    if (inFlight.current) return
    inFlight.current = true
    setSaving(true)
    try {
      await addAnotherPack(existing, colors, packs)
      const setId = existing[0].setId
      finish({ saved: await db.supplies.filter((s) => s.setId === setId).toArray(), addedTo: true })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  async function submit(e: React.FormEvent, separate = false) {
    e.preventDefault()
    if (inFlight.current) return
    if (!f.name.trim()) return setError('Please give it a name, like “Astrobrights cardstock”.')
    if (!colors.length) return setError('Add at least one color.')
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      // Already have this exact pack? Ask before making a second copy.
      if (!separate) {
        const same = await findSamePack(f.name, f.setName, colors)
        if (same) {
          setDupe(same)
          return
        }
      }
      const saved = await saveAssortment({
        base: { name: f.name, category: f.category, brand: f.brand || undefined, subtype: f.subtype || undefined, dimensions: f.dimensions || undefined, unit: f.unit, upc: f.upc || undefined, source: 'manual' },
        setName: f.setName,
        colors,
        packPrice: parseMoney(price),
        packs,
      })
      if (f.upc && isValidUpc(f.upc)) {
        const product = { name: f.name, setName: f.setName, category: f.category, brand: f.brand, subtype: f.subtype, dimensions: f.dimensions, unit: f.unit, packSize: total, colors }
        await cacheUpc(normalizeUpc(f.upc), product)
        void import('../lib/cloud/products').then((m) => m.contributeProduct(normalizeUpc(f.upc), product))
      }
      void learnAndTell(colors.map((c) => ({ name: c.color, hex: c.hex })))
      finish({ saved })
    } catch (err) {
      setError((err as Error).message || "Couldn't save. Please try again.")
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  if (done) {
    const first = done.saved[0]
    const count = done.saved.reduce((n, s) => n + s.quantity, 0)
    return (
      <div ref={top} className="flex flex-col gap-4 rounded-2xl bg-leaf-50 p-5 ring-1 ring-green-200" role="status">
        <p className="text-xl font-bold text-leaf-600">✓ {done.addedTo ? 'Added another pack to' : 'Saved'} {first?.setName ?? first?.name}</p>
        <p>
          {done.saved.length} colors, now {Math.round(count * 1000) / 1000} {unitLabel(first?.unit ?? 'sheet', count)} in your stash.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>Enter a different pack</Button>
          {onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              I'm done
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (dupe) {
    return (
      <div ref={top} className="flex flex-col gap-4 rounded-2xl bg-sun-300/40 p-5 ring-2 ring-sun-500" role="alertdialog" aria-label="You already have this pack">
        <p className="text-xl font-bold">You already have this pack</p>
        <p>
          <strong>{dupe[0].setName ?? dupe[0].name}</strong> with the same {dupe.length} colors is already in your stash. Did you buy another one?
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button disabled={saving} onClick={() => void addToExisting(dupe)}>
            Yes, add it as another pack
          </Button>
          <Button variant="secondary" disabled={saving} onClick={(e) => void submit(e as unknown as React.FormEvent, true)}>
            Save a separate copy
          </Button>
          <Button variant="ghost" onClick={() => setDupe(null)}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {panel}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" aria-label="Photo of the pack" className="sr-only" onChange={(e) => readPhoto(e.target.files?.[0])} />
      <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <PhotoDrop onFile={(f) => guard(() => void readPhoto(f))} disabled={reading}>
          <Button variant="secondary" onClick={() => guard(() => photoRef.current?.click())} disabled={reading}>
            📷 Read the colors from a photo
          </Button>
        </PhotoDrop>
        <p className="text-sm text-stone-600">Photograph the edge or back of the pack where the color names are printed. You'll check everything before saving.</p>
        {reading && <Spinner label="Reading the colors…" />}
        {noNames && !reading && (
          <div className="flex flex-col gap-2">
            <Notice tone="info">{noNames}</Notice>
            <Button className="self-start" onClick={() => setPicking('collect')}>
              🎨 Tap the colors on this photo
            </Button>
          </div>
        )}
      </div>

      <Field label="Type of supply">
        {(id) => (
          <select id={id} className={inputClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, unit: categories.find((c) => c.id === e.target.value)?.units[0] ?? f.unit })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={`What is one ${one}? (without the color)`} hint="For example “Astrobrights cardstock” or “Glitter HTV”.">
        {(id) => <input id={id} className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pack name (optional)" hint="As printed, e.g. “Spectrum assortment”.">
          {(id) => <input id={id} className={inputClass} value={f.setName} onChange={(e) => setF({ ...f, setName: e.target.value })} />}
        </Field>
        <Field label="Brand">{(id) => <input id={id} className={inputClass} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />}</Field>
      </div>
      {cat?.subtypes && cat.subtypes.length > 0 && (
        <div>
          <p className="mb-2 font-semibold">Kind</p>
          <div className="flex flex-wrap gap-2">
            {cat.subtypes.map((s) => (
              <Chip key={s} selected={f.subtype === s} onClick={() => setF({ ...f, subtype: f.subtype === s ? '' : s })}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <Field label="Size">
        {(id) => (
          <>
            <input id={id} className={inputClass} value={f.dimensions} placeholder="e.g. 8.5 x 11 in" onChange={(e) => setF({ ...f, dimensions: e.target.value })} />
            {cat && cat.sizes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {cat.sizes.map((s) => (
                  <Chip key={s} selected={f.dimensions === s} onClick={() => setF({ ...f, dimensions: s })}>
                    {s}
                  </Chip>
                ))}
              </div>
            )}
          </>
        )}
      </Field>

      <BarcodeField value={f.upc} onChange={(upc) => setF({ ...f, upc })} hint="Optional. Saves the pack so scanning it next time fills in every color." />

      <fieldset className={`flex flex-col gap-3 rounded-2xl p-3 ring-1 ${countsUncertain ? 'bg-sun-300/30 ring-sun-500' : 'bg-white ring-stone-200'}`}>
        <legend className="px-1 font-semibold">Colors in one pack</legend>
        {countsUncertain && <p className="text-sm font-medium text-amber-900">⚠ Please check how many of each color the pack has.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span>Same number of each:</span>
          <Stepper label="same number of each color" value={same} onChange={setSame} />
          <Button
            variant="secondary"
            onClick={() => {
              setRows((rs) => rs.map((r) => ({ ...r, count: same })))
              setCountsUncertain(false)
            }}
          >
            Apply to all
          </Button>
        </div>
        <p className="text-sm text-stone-600">Drag ⠿ to put the colors in the same order as the list on the pack. It makes checking them much easier.</p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => `Picked up ${labelOf(rows.find((r) => r.key === active.id)!, rows.findIndex((r) => r.key === active.id))}.`,
              onDragOver: ({ over }) => (over ? `Moving to position ${rows.findIndex((r) => r.key === over.id) + 1} of ${rows.length}.` : ''),
              onDragEnd: ({ over }) => (over ? `Dropped at position ${rows.findIndex((r) => r.key === over.id) + 1}.` : 'Dropped.'),
              onDragCancel: () => 'Move cancelled.',
            },
          }}
        >
          <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <ColorRow
                  key={r.key}
                  row={r}
                  index={i}
                  label={labelOf(r, i)}
                  onChange={(patch) => setRow(r.key, patch)}
                  onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  onEnter={() => addAfter(i, r.count)}
                  autoFocus={focusKey === r.key}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => addAfter(rows.length - 1, rows.at(-1)?.count ?? 1)}>
            + Add a color
          </Button>
          <Button variant="ghost" onClick={() => setPasting(!pasting)} aria-expanded={pasting}>
            📋 Paste a list of colors
          </Button>
          <Button variant="ghost" onClick={() => setPicking(rows.some((r) => r.color.trim()) ? 'sequence' : 'collect')}>
            🎨 Pick colors from a photo
          </Button>
        </div>
        <p className="text-sm text-stone-600">
          Tap 💧 by a color to pick its exact shade{hasEyeDropper() ? ' from anywhere on your screen, like a photo of the paper' : ''}. Or use “Pick colors from a photo”: with names typed in, you tap each one in order; with no names, each color you tap is added to the list.
        </p>
        {namesAreGuesses && <p className="text-sm font-medium text-amber-900">⚠ Names like “Orange 2” are suggestions from the color. Change them to the names on the pack if it has them.</p>}
        <ColorPickSheet
          open={picking !== false}
          onClose={() => setPicking(false)}
          photo={lastPhoto}
          collect={picking === 'collect'}
          onAdd={addPicked}
          targets={rows.filter((r) => r.color.trim()).map((r) => r.color.trim())}
          onPick={(i, hex) => {
            const named = rows.filter((r) => r.color.trim())
            if (hex && named[i]) setRow(named[i].key, { hex })
          }}
        />
        {pasting && (
          <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
            <label htmlFor="paste-colors" className="font-semibold">
              Paste the colors (one per line, or separated by commas)
            </label>
            <textarea id="paste-colors" rows={6} className={`${inputClass} py-2`} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'Black\nRed\nSour Apple\n…'} />
            <PasteSummary text={pasted} existing={rows.map((r) => r.color)} />
            <Button
              variant="secondary"
              className="self-start"
              disabled={!parseColorList(pasted).length}
              onClick={() => {
                const have = new Set(rows.map((r) => r.color.trim().toLowerCase()).filter(Boolean))
                const fresh = parseColorList(pasted).filter((n) => !have.has(n.toLowerCase()))
                setRows((rs) => [...rs.filter((r) => r.color.trim()), ...toRows(fresh.map((color) => ({ color, count: same })))])
                setPasted('')
                setPasting(false)
              }}
            >
              Add these colors ({same} of each)
            </Button>
          </div>
        )}
        <p className="font-semibold" aria-live="polite">
          {colors.length} color{colors.length === 1 ? '' : 's'} · {total} {unitLabel(f.unit, total)} per pack
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Counted in`}>
          {(id) => (
            <select id={id} className={inputClass} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Supply['unit'] })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex flex-col gap-1">
          <span className="font-semibold">How many packs?</span>
          <Stepper label="how many packs" value={packs} onChange={(n) => setPacks(Math.max(1, Math.round(n)))} />
        </div>
      </div>

      <Field label="Price for one pack ($) (optional)">
        {(id) => <input id={id} inputMode="decimal" className={inputClass} value={price} placeholder="e.g. 11.99" onChange={(e) => setPrice(e.target.value)} />}
      </Field>
      {perUnit !== undefined && (
        <p className="-mt-3 rounded-xl bg-leaf-50 px-3 py-2 font-semibold text-leaf-600" aria-live="polite">
          That's {formatMoney(perUnit)} per {one}, for every color.
        </p>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving} className="min-h-14 flex-1 text-lg">
          Save {colors.length} color{colors.length === 1 ? '' : 's'} ({roundTotal(total * packs)} {many})
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

const roundTotal = (n: number) => Math.round(n * 1000) / 1000

function ColorRow({ row, index, label, onChange, onRemove, onEnter, autoFocus }: { row: Row; index: number; label: string; onChange: (p: Partial<PackColor>) => void; onRemove: () => void; onEnter: () => void; autoFocus: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) input.current?.focus()
  }, [autoFocus])
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.key })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-2 rounded-xl ${isDragging ? 'relative z-10 bg-brand-50 shadow-lg ring-2 ring-brand-500' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${label}`}
        className="flex min-h-12 min-w-11 cursor-grab touch-none items-center justify-center rounded-lg text-2xl text-stone-500 hover:bg-stone-100 active:cursor-grabbing"
      >
        ⠿
      </button>
      <span className="w-6 text-right text-sm font-semibold text-stone-500" aria-hidden>
        {index + 1}
      </span>
      <ColorSwatch label={label} value={row.hex} onChange={(hex) => onChange({ hex })} />
      <label htmlFor={`color-${row.key}`} className="sr-only">
        Color {index + 1}
      </label>
      <input
        id={`color-${row.key}`}
        ref={input}
        className={`${fieldClass} min-w-40 flex-1`}
        placeholder="Color name, e.g. Rocket Red"
        value={row.color}
        onChange={(e) => onChange({ color: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnter()
          }
        }}
      />
      <Stepper label={`how many ${label}`} value={row.count} onChange={(n) => onChange({ count: n })} />
      <button type="button" aria-label={`Remove ${label}`} className="min-h-11 min-w-11 rounded-full text-xl text-stone-500 hover:bg-stone-100" onClick={onRemove}>
        ×
      </button>
      {row.hex && <ColorNameCheck hex={row.hex} onName={(name) => isReplaceableName(row.color) && onChange({ color: name })} />}
    </li>
  )
}

/** "29 colors: 28 new, 1 already listed (Sour Apple)" so it's clear what pasting will do. */
export function PasteSummary({ text, existing }: { text: string; existing: (string | undefined)[] }) {
  const names = parseColorList(text)
  if (!names.length) return null
  const have = new Set(existing.map((c) => (c ?? '').trim().toLowerCase()).filter(Boolean))
  const already = names.filter((n) => have.has(n.toLowerCase()))
  return (
    <p className="text-sm text-stone-700" aria-live="polite">
      {names.length} color{names.length === 1 ? '' : 's'} found: {names.length - already.length} new
      {already.length > 0 && `, ${already.length} already here (${already.slice(0, 3).join(', ')}${already.length > 3 ? '…' : ''})`}.
    </p>
  )
}
