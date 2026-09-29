import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import SupplyForm, { emptyDraft } from '../components/SupplyForm'
import AssortmentForm from '../components/AssortmentForm'
import BarcodeField from '../components/BarcodeField'
import { addColorsToPack, parseColorList, setPackBarcode } from '../lib/assortment'
import { PasteSummary } from '../components/AssortmentForm'
import { Stepper, inputClass } from '../components/ui'
import { isValidUpc, normalizeUpc } from '../lib/upc'
import type { Supply } from '../types'
import { Chip } from '../components/ui'
import { Link } from 'react-router-dom'
import { Button, Notice, PageHeader, Spinner } from '../components/ui'
import { deleteSupply } from '../lib/repo'

/** /add/manual (new) and /supply/:id (edit). */
export default function SupplyEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  // undefined = loading, null = new supply or not found
  const existing = useLiveQuery(async () => (id ? ((await db.supplies.get(id)) ?? null) : null), [id])
  const [savedName, setSavedName] = useState('')
  const [formKey, setFormKey] = useState(0)
  const [lastCategory, setLastCategory] = useState('adhesive-vinyl')
  const [mixed, setMixed] = useState(false)
  const siblings = useLiveQuery(async () => (existing?.setId ? db.supplies.where('id').notEqual(existing.id).filter((s) => s.setId === existing.setId).toArray() : []), [existing?.setId, existing?.id]) ?? []

  if (id && existing === undefined) return <Spinner />
  if (id && existing === null) return <Notice tone="error">That supply wasn't found. It may have been deleted.</Notice>

  if (existing) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Edit supply" />
        {existing.setId && (
          <div className="mb-4 flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <p>
              Part of <strong>{existing.setName}</strong>, a pack with {siblings.length + 1} colors.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/inventory" className="font-semibold text-brand-700 underline">
                See all its colors in My stash
              </Link>
            </div>
            <PackBarcode items={[existing, ...siblings]} />
            <AddColors items={[existing, ...siblings]} />
            <Button
              variant="danger"
              className="self-start"
              onClick={async () => {
                if (!window.confirm(`Delete all ${siblings.length + 1} colors of “${existing.setName}” from your stash?`)) return
                await db.supplies.bulkDelete([existing.id, ...siblings.map((s) => s.id)])
                navigate('/inventory', { replace: true })
              }}
            >
              Delete the whole pack
            </Button>
          </div>
        )}
        <SupplyForm
          initial={existing}
          onSaved={() => navigate(-1)}
          onCancel={() => navigate(-1)}
          onDelete={async () => {
            if (window.confirm(`Delete “${existing.name}” from your stash?`)) {
              await deleteSupply(existing.id)
              navigate('/inventory', { replace: true })
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Type it in" />
      <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="What are you adding?">
        <Chip selected={!mixed} onClick={() => setMixed(false)}>
          One item
        </Chip>
        <Chip selected={mixed} onClick={() => setMixed(true)}>
          A pack with several colors
        </Chip>
      </div>
      {mixed && (
        <AssortmentForm
          onSaved={(saved) => {
            setSavedName(`${saved[0]?.setName ?? 'pack'} (${saved.length} colors)`)
            setMixed(false)
            window.scrollTo(0, 0)
          }}
          onCancel={() => setMixed(false)}
        />
      )}
      {savedName && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Notice tone="success">Saved “{savedName}”. Add another?</Notice>
          <Button variant="secondary" onClick={() => navigate('/inventory')}>
            I'm done
          </Button>
        </div>
      )}
      {!mixed && <SupplyForm
        key={formKey}
        initial={emptyDraft(lastCategory)}
        saveLabel="Save and add another"
        onSaved={(s) => {
          // Stay on the form for quick entry of many items (spec Phase 1: "add 20 items by hand").
          setSavedName(s.name)
          setLastCategory(s.category)
          setFormKey((k) => k + 1)
          window.scrollTo(0, 0)
        }}
        onCancel={() => navigate(-1)}
      />}
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
    <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
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
