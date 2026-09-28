import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCategories, useSetup } from '../hooks'
import { makeVisionImage } from '../lib/images'
import { readBulkPhoto, type ProposedSupply } from '../lib/ai/vision'
import { friendlyError } from '../lib/ai/aiClient'
import { saveSupplies, type SupplyInput } from '../lib/repo'
import { unitLabel } from '../components/SupplyForm'
import { useAiGate } from '../components/useAiGate'
import { Button, Notice, PageHeader, Spinner, inputClass } from '../components/ui'
import { UNITS, type Quality, type Supply } from '../types'

interface Row extends ProposedSupply {
  key: number
}

// Bulk photo intake (spec 8.4): one photo → many proposed supplies → review → save all.
export default function BulkAdd() {
  const setup = useSetup()
  const categories = useCategories()
  const navigate = useNavigate()
  const { guard, panel } = useAiGate()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [location, setLocation] = useState('')

  async function read(f: File, quality: Quality) {
    setBusy(true)
    setError('')
    try {
      const img = await makeVisionImage(f)
      const items = await readBulkPhoto(img, categories, quality)
      if (!items.length) setError("We couldn't spot any craft supplies in that photo. Try a closer, brighter photo.")
      setRows(items.map((it, i) => ({ ...it, key: i })))
    } catch (e) {
      setError(friendlyError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const update = (key: number, patch: Partial<Supply>) =>
    setRows((rs) =>
      rs!.map((r) => {
        if (r.key !== key) return r
        const uncertain = { ...r.uncertain }
        for (const k of Object.keys(patch)) delete uncertain[k as keyof Supply]
        return { ...r, supply: { ...r.supply, ...patch }, uncertain }
      }),
    )

  async function saveAll() {
    if (!rows?.length) return
    await saveSupplies(
      rows.map(
        (r) =>
          ({
            ...r.supply,
            name: r.supply.name?.trim() || 'Unnamed supply',
            category: r.supply.category ?? 'other',
            quantity: r.supply.quantity ?? 1,
            unit: r.supply.unit ?? 'piece',
            location: location.trim() || r.supply.location,
            source: 'vision',
          }) as SupplyInput,
      ),
    )
    navigate('/inventory')
  }

  const hl = (r: Row, k: keyof Supply) => (r.uncertain[k] ? 'border-sun-500 bg-sun-300/40' : '')

  if (!setup) return <Spinner />

  return (
    <div>
      {panel}
      <PageHeader title="Add a whole shelf" subtitle="Take one photo of a shelf, bin or pile. We'll list what we see, and you tidy up the list." />
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setFile(f)
            void read(f, setup.quality)
          }
        }}
      />

      {!rows && !busy && (
        <div className="flex flex-col gap-3">
          <Button className="min-h-16 text-lg" onClick={() => guard(() => input.current?.click())}>
            📷 Take or choose a photo
          </Button>
          <p className="text-stone-600">Tips: good light, labels facing the camera, and not too far away. Rolls on their side are easiest to read.</p>
        </div>
      )}
      {busy && <Spinner label="Looking at your photo… this can take up to half a minute." />}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      {rows && !busy && (
        <div className="flex flex-col gap-4">
          <Notice tone="info">
            We found {rows.length} item{rows.length === 1 ? '' : 's'}. Yellow boxes are guesses. Fix anything that's wrong, remove what you don't want, then
            save.
          </Notice>
          <ul className="flex flex-col gap-3">
            {rows.map((r, i) => (
              <li key={r.key} className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                <div className="grid gap-2 sm:grid-cols-[2fr_1.5fr_1fr_auto_auto]">
                  <label className="sr-only" htmlFor={`bn-${r.key}`}>
                    Name of item {i + 1}
                  </label>
                  <input id={`bn-${r.key}`} className={`${inputClass} ${hl(r, 'name')}`} value={r.supply.name ?? ''} onChange={(e) => update(r.key, { name: e.target.value })} />
                  <label className="sr-only" htmlFor={`bc-${r.key}`}>
                    Type of item {i + 1}
                  </label>
                  <select id={`bc-${r.key}`} className={`${inputClass} ${hl(r, 'category')}`} value={r.supply.category} onChange={(e) => update(r.key, { category: e.target.value })}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor={`bq-${r.key}`}>
                    How many of item {i + 1}
                  </label>
                  <input
                    id={`bq-${r.key}`}
                    inputMode="decimal"
                    className={`${inputClass} ${hl(r, 'quantity')}`}
                    value={r.supply.quantity ?? ''}
                    onChange={(e) => update(r.key, { quantity: Number(e.target.value) || 0 })}
                  />
                  <label className="sr-only" htmlFor={`bu-${r.key}`}>
                    Unit of item {i + 1}
                  </label>
                  <select id={`bu-${r.key}`} className={inputClass} value={r.supply.unit} onChange={(e) => update(r.key, { unit: e.target.value as Supply['unit'] })}>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {unitLabel(u)}
                      </option>
                    ))}
                  </select>
                  <Button variant="danger" aria-label={`Remove item ${i + 1}`} onClick={() => setRows((rs) => rs!.filter((x) => x.key !== r.key))}>
                    Remove
                  </Button>
                </div>
                <label className="sr-only" htmlFor={`bcol-${r.key}`}>
                  Color and size of item {i + 1}
                </label>
                <input
                  id={`bcol-${r.key}`}
                  className={`${inputClass} mt-2 ${hl(r, 'color') || hl(r, 'dimensions')}`}
                  placeholder="Color, size"
                  value={[r.supply.color, r.supply.dimensions].filter(Boolean).join(', ')}
                  onChange={(e) => {
                    const [color, ...rest] = e.target.value.split(',')
                    update(r.key, { color: color.trim() || undefined, dimensions: rest.join(',').trim() || undefined })
                  }}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1">
            <label htmlFor="bulk-loc" className="font-semibold">
              Where is this shelf? (optional, applies to all)
            </label>
            <input id="bulk-loc" className={inputClass} placeholder="e.g. craft room, bin 3" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button className="min-h-14 flex-1 text-lg" disabled={!rows.length} onClick={saveAll}>
              Save all {rows.length}
            </Button>
            {file && (
              <Button variant="secondary" onClick={() => read(file, 'best')}>
                Try harder
              </Button>
            )}
            <Button variant="ghost" onClick={() => setRows(null)}>
              Start over
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
