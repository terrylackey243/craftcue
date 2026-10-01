import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { useCategories } from '../hooks'
import BarcodeField from '../components/BarcodeField'
import { PasteSummary } from '../components/AssortmentForm'
import { unitLabel } from '../components/SupplyForm'
import { Button, Field, Notice, PageHeader, Spinner, Stepper, inputClass } from '../components/ui'
import { addColorsToPack, packValue, parseColorList, setPackBarcode, updatePack, type PackField, type PackPatch } from '../lib/assortment'
import { formatMoney, parseMoney } from '../lib/money'
import { isValidUpc, normalizeUpc } from '../lib/upc'
import { ADHESIVES, UNITS, type Supply } from '../types'

/** /pack/:setId — change a mixed-color pack's shared details for every color at once. */
export default function PackEdit() {
  const { setId } = useParams()
  const navigate = useNavigate()
  const items = useLiveQuery(async () => (await db.supplies.filter((s) => s.setId === setId).toArray()).sort((a, b) => (a.packOrder ?? 0) - (b.packOrder ?? 0)), [setId])
  if (!items) return <Spinner />
  if (!items.length) return <Notice tone="error">That pack wasn't found. It may have been deleted.</Notice>
  const name = items[0].setName || items[0].name
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Edit pack" subtitle={`${name} · ${items.length} colors. Changes here apply to every color.`} />
      <PackDetails items={items} />
      <Colors items={items} />
      <PackBarcode items={items} />
      <AddColors items={items} />
      <Button
        variant="danger"
        className="self-start"
        onClick={async () => {
          if (!window.confirm(`Delete all ${items.length} colors of “${name}” from your stash?`)) return
          await db.supplies.bulkDelete(items.map((s) => s.id))
          navigate('/inventory', { replace: true })
        }}
      >
        Delete the whole pack
      </Button>
    </div>
  )
}

type Draft = Record<PackField, string>
const TEXT: [PackField, string, string?][] = [
  ['setName', 'Pack name', 'As printed on the pack, e.g. “Astrobrights Spectrum assortment”.'],
  ['name', 'What is one of them? (without the color)', 'For example “Fine point pen” or “Astrobrights cardstock”.'],
  ['subtype', 'Kind (optional)'],
  ['brand', 'Brand (optional)'],
  ['finish', 'Finish (optional)', 'Matte, glossy, glitter…'],
  ['dimensions', 'Size (optional)', 'For example “8.5 x 11 in” or “0.4 mm tip”.'],
  ['location', 'Where you keep it (optional)'],
]

function PackDetails({ items }: { items: Supply[] }) {
  const categories = useCategories()
  const start = useMemo(() => {
    const d = {} as Draft
    const mixed = new Set<PackField>()
    for (const k of ['setName', 'name', 'category', 'subtype', 'brand', 'finish', 'dimensions', 'unit', 'adhesive', 'lowAt', 'location', 'notes', 'packPrice'] as PackField[]) {
      const v = packValue(items, k)
      if (v.mixed) mixed.add(k)
      d[k] = v.mixed || v.value === undefined ? '' : k === 'packPrice' ? (v.value as number).toFixed(2) : String(v.value)
    }
    if (!mixed.has('lowAt') && d.lowAt === '') d.lowAt = '1' // the default when never set
    return { d, mixed }
    // Only on first load: later edits to the colors shouldn't wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [d, setD] = useState<Draft>(start.d)
  const [touched, setTouched] = useState<Set<PackField>>(new Set())
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const set = (k: PackField, v: string) => {
    setD((p) => ({ ...p, [k]: v }))
    setTouched((t) => new Set(t).add(k))
    setMsg('')
  }
  const hint = (k: PackField, normal?: string) => (start.mixed.has(k) && !touched.has(k) ? 'Different for each color now. Type here to set the same for all of them.' : normal)
  const total = items.reduce((n, s) => n + (s.packSize ?? 0), 0)
  const price = parseMoney(d.packPrice)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (touched.has('name') && !d.name.trim()) return setError('Give the item a name.')
    const patch: PackPatch = {}
    for (const k of touched) {
      const v = d[k].trim()
      if (k === 'lowAt') patch.lowAt = Math.max(0, Number(v) || 0)
      else if (k === 'packPrice') patch.packPrice = parseMoney(v)
      else if (k === 'unit') patch.unit = v as Supply['unit']
      else if (k === 'adhesive') patch.adhesive = (v || undefined) as Supply['adhesive']
      else (patch as Record<string, unknown>)[k] = v || undefined
    }
    await updatePack(items, patch)
    setTouched(new Set())
    setMsg(`Saved for all ${items.length} colors.`)
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="text-lg font-bold">Pack details</h2>
      {TEXT.slice(0, 2).map(([k, label, normal]) => (
        <Field key={k} label={label} hint={hint(k, normal)}>
          {(id) => <input id={id} className={inputClass} value={d[k]} onChange={(e) => set(k, e.target.value)} />}
        </Field>
      ))}
      <Field label="Type of supply" hint={hint('category')}>
        {(id) => (
          <select id={id} className={inputClass} value={d.category} onChange={(e) => set('category', e.target.value)}>
            {start.mixed.has('category') && !touched.has('category') && <option value="">Different for each color</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {TEXT.slice(2, 6).map(([k, label, normal]) => (
        <Field key={k} label={label} hint={hint(k, normal)}>
          {(id) => <input id={id} className={inputClass} value={d[k]} onChange={(e) => set(k, e.target.value)} />}
        </Field>
      ))}
      <Field label="Counted in" hint={hint('unit')}>
        {(id) => (
          <select id={id} className={inputClass} value={d.unit} onChange={(e) => set('unit', e.target.value)}>
            {start.mixed.has('unit') && !touched.has('unit') && <option value="">Different for each color</option>}
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        label="Price for the whole pack (optional)"
        hint={
          hint('packPrice') ??
          (price !== undefined && total > 0 ? `That’s ${formatMoney(price / total)} each (${total} in the pack). Every color’s cost is updated.` : 'Leave blank if you don’t know.')
        }
      >
        {(id) => <input id={id} inputMode="decimal" className={inputClass} value={d.packPrice} placeholder="0.00" onChange={(e) => set('packPrice', e.target.value)} />}
      </Field>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">Warn me when each color is down to</p>
        <Stepper label="warn when each color is down to" value={Number(d.lowAt) || 0} onChange={(n) => set('lowAt', String(Math.max(0, n)))} />
        <p className="text-sm text-stone-600">{hint('lowAt', '0 means only when a color runs out, handy when you keep just one of each.')}</p>
      </div>
      <Field label="Adhesive / backing" hint={hint('adhesive')}>
        {(id) => (
          <select id={id} className={inputClass} value={d.adhesive} onChange={(e) => set('adhesive', e.target.value)}>
            <option value="">Not sure / doesn't apply</option>
            {ADHESIVES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </Field>
      {TEXT.slice(6).map(([k, label, normal]) => (
        <Field key={k} label={label} hint={hint(k, normal)}>
          {(id) => <input id={id} className={inputClass} value={d[k]} onChange={(e) => set(k, e.target.value)} />}
        </Field>
      ))}
      <Field label="Notes (optional)" hint={hint('notes')}>
        {(id) => <textarea id={id} rows={3} className={`${inputClass} py-2`} value={d.notes} onChange={(e) => set('notes', e.target.value)} />}
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      {msg && <Notice tone="success">{msg}</Notice>}
      <Button type="submit" className="self-start" disabled={!touched.size}>
        Save for all {items.length} colors
      </Button>
    </form>
  )
}

function Colors({ items }: { items: Supply[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="text-lg font-bold">Colors</h2>
      <p className="text-sm text-stone-600">Tap a color to change just that one (its name, how many you have, its photo). To change the order, use “Change order” on the pack in My stash.</p>
      <ul className="divide-y divide-stone-100">
        {items.map((s) => (
          <li key={s.id}>
            <Link to={`/supply/${s.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:bg-stone-50">
              <span className="font-medium">{s.color || s.name}</span>
              <span className="text-sm text-stone-600">
                {Math.round(s.quantity * 1000) / 1000} {unitLabel(s.unit, s.quantity)} ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One barcode for every color of a mixed pack. */
function PackBarcode({ items }: { items: Supply[] }) {
  const current = items.find((s) => s.upc)?.upc ?? ''
  const [upc, setUpc] = useState(current)
  const [msg, setMsg] = useState('')
  const digits = upc.replace(/\D/g, '')
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <BarcodeField label="Barcode for the whole pack" value={upc} onChange={(v) => { setUpc(v); setMsg('') }} />
      <Button
        variant="secondary"
        className="self-start"
        disabled={!isValidUpc(digits) || normalizeUpc(digits) === current}
        onClick={async () => {
          await setPackBarcode(items, normalizeUpc(digits))
          setMsg(`Saved on all ${items.length} colors. Scanning this pack next time fills everything in.`)
        }}
      >
        Save barcode for all {items.length} colors
      </Button>
      {msg && <Notice tone="success">{msg}</Notice>}
    </div>
  )
}

/** Add colors to a pack that's already saved: paste or type them, choose how many of each. */
function AddColors({ items }: { items: Supply[] }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [count, setCount] = useState(items[0]?.packSize ?? 1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const names = parseColorList(text)
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="secondary" className="self-start" onClick={() => { setOpen(true); setMsg('') }}>
          ➕ Add colors to this pack
        </Button>
        {msg && <Notice tone="success">{msg}</Notice>}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-stone-50 p-3">
      <label htmlFor="add-colors" className="font-semibold">
        Colors to add (paste a list, one per line or separated by commas)
      </label>
      <textarea id="add-colors" rows={8} className={`${inputClass} py-2`} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Black\nRed\nBlue\n…'} />
      <PasteSummary text={text} existing={items.map((s) => s.color)} />
      <p className="text-sm text-stone-600">If your list includes every color already in the pack, the pack is put in your list's order.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">How many of each new color?</span>
        <Stepper label="how many of each new color" value={count} onChange={(n) => setCount(Math.max(1, n))} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !names.length}
          onClick={async () => {
            setBusy(true)
            const r = await addColorsToPack(items, names, count)
            setBusy(false)
            setOpen(false)
            setText('')
            setMsg(`Added ${r.added} color${r.added === 1 ? '' : 's'}${r.reordered ? ', and put the pack in your list’s order' : ''}.`)
          }}
        >
          Add {names.length ? names.filter((n) => !items.some((s) => (s.color ?? '').toLowerCase() === n.toLowerCase())).length : ''} colors
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
