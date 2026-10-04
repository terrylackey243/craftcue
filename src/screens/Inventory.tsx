import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCategoryMap, useSupplies } from '../hooks'
import { adjustQuantity } from '../lib/repo'
import { stockLevel } from '../lib/shopping'
import { Badge, Button, ButtonLink, EmptyState, PageHeader, Spinner, inputClass } from '../components/ui'
import { unitLabel } from '../components/SupplyForm'
import type { Supply } from '../types'
import { categoryIcon } from '../data/categories'
import { unitStep } from '../lib/units'
import { groupStash, reorderSet, type StashEntry } from '../lib/assortment'
import { ScannerView } from '../components/BarcodeField'
import { Sheet } from '../components/ui'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/** Barcodes are compared as digits only, ignoring the extra leading zero of a 13-digit EAN. */
const barcodeDigits = (t: string) => t.replace(/\D/g, '').replace(/^0+/, '')

/**
 * Every word must match somewhere: name, pack, color, brand, kind, finish, size, place, notes,
 * type or barcode. A query that is only digits (and spaces, as printed under the bars) is read
 * as one barcode, and part of a barcode matches too.
 */
export function filterSupplies(supplies: Supply[], q: string, category: string, location: string, categoryName: (id: string) => string): Supply[] {
  const trimmed = q.trim()
  const asBarcode = /^[\d\s-]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 6 ? barcodeDigits(trimmed) : ''
  const words = asBarcode ? [] : trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  return supplies.filter((s) => {
    if (category && s.category !== category) return false
    if (location && (s.location ?? '') !== location) return false
    if (asBarcode) return Boolean(s.upc) && barcodeDigits(s.upc!).includes(asBarcode)
    if (!words.length) return true
    const hay = [s.name, s.setName, s.color, s.brand, s.subtype, s.finish, s.dimensions, s.location, s.notes, categoryName(s.category)].join(' ').toLowerCase()
    // Long numbers are checked against the barcode; short ones ("12", "65") only against the text,
    // since barcodes contain almost every short number.
    return words.every((w) => (/^\d{6,}$/.test(w) ? Boolean(s.upc) && barcodeDigits(s.upc!).includes(barcodeDigits(w)) : hay.includes(w)))
  })
}

function LevelBadge({ s }: { s: Supply }) {
  const level = stockLevel(s)
  if (level === 'out') return <Badge tone="bad">Out</Badge>
  if (level === 'low') return <Badge tone="warn">Low</Badge>
  return null
}

function QuickQty({ s }: { s: Supply }) {
  // Colors of a pack share a name, so say which color the buttons change.
  const label = s.color && s.setId ? `${s.name}, ${s.color}` : s.name
  const step = unitStep(s.unit)
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${label}`}>
      <button
        type="button"
        aria-label={`Use one ${label}`}
        className="min-h-11 min-w-11 rounded-lg border-2 border-stone-300 bg-white text-xl font-bold hover:border-brand-500 disabled:opacity-40"
        disabled={s.quantity <= 0}
        onClick={() => adjustQuantity(s.id, -step)}
      >
        −
      </button>
      <span className="min-w-16 text-center font-semibold" aria-live="polite">
        {s.quantity} <span className="text-sm font-normal text-stone-600">{unitLabel(s.unit, s.quantity)}</span>
      </span>
      <button
        type="button"
        aria-label={`Add one ${label}`}
        className="min-h-11 min-w-11 rounded-lg border-2 border-stone-300 bg-white text-xl font-bold hover:border-brand-500"
        onClick={() => adjustQuantity(s.id, step)}
      >
        +
      </button>
    </div>
  )
}

function SupplyRow({ s, catName, indent = false }: { s: Supply; catName: (id: string) => string; indent?: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-3 p-3 ${indent ? 'bg-stone-50 pl-8' : ''}`}>
      {s.thumbnail ? (
        <img src={s.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : s.colorHex ? (
        <span aria-hidden className="h-14 w-14 shrink-0 rounded-lg ring-1 ring-stone-200" style={{ background: s.colorHex }} />
      ) : (
        <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-2xl">
          {indent ? '🎨' : categoryIcon(s.category)}
        </span>
      )}
      <Link to={`/supply/${s.id}`} className="min-w-40 flex-1">
        <span className="block font-semibold text-stone-900 underline-offset-2 hover:underline">{indent ? s.color || s.name : s.name}</span>
        <span className="block text-sm text-stone-600">
          {(indent ? [s.dimensions, s.subtype] : [catName(s.category), s.color, s.dimensions, s.location]).filter(Boolean).join(' · ')}
        </span>
      </Link>
      <LevelBadge s={s} />
      <QuickQty s={s} />
    </li>
  )
}

/** A mixed-color pack: one row that opens to show each color. */
function SetRow({ entry, open, onToggle, catName }: { entry: Extract<StashEntry, { kind: 'set' }>; open: boolean; onToggle: () => void; catName: (id: string) => string }) {
  const first = entry.items[0]
  const total = Math.round(entry.items.reduce((n, s) => n + s.quantity, 0) * 1000) / 1000
  const low = entry.items.filter((s) => stockLevel(s) !== 'ok').length
  const [reordering, setReordering] = useState(false)
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-stone-50">
        <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-2xl">
          {categoryIcon(first.category)}
        </span>
        <span className="min-w-40 flex-1">
          <span className="block font-semibold text-stone-900">{entry.name}</span>
          <span className="block text-sm text-stone-600">
            {[catName(first.category), `${entry.items.length} colors`, `${total} ${unitLabel(first.unit, total)}`, first.dimensions].filter(Boolean).join(' · ')}
          </span>
        </span>
        {low > 0 && <Badge tone="warn">{low} low</Badge>}
        <span aria-hidden className={`text-2xl text-stone-400 transition ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {open && (
        <div className="border-t border-stone-100">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-50 px-3 py-2">
            <span className="text-sm text-stone-600">{reordering ? 'Drag ⠿ to match the order printed on the pack.' : ''}</span>
            <div className="flex flex-wrap gap-2">
              {!reordering && (
                <ButtonLink to={`/pack/${entry.setId}`} variant="ghost">
                  ✏️ Edit pack
                </ButtonLink>
              )}
              <Button variant={reordering ? 'primary' : 'ghost'} onClick={() => setReordering(!reordering)}>
                {reordering ? 'Done' : '↕ Change order'}
              </Button>
            </div>
          </div>
          {reordering ? (
            <ReorderList items={entry.items} />
          ) : (
            <ul className="divide-y divide-stone-100">
              {entry.items.map((s) => (
                <SupplyRow key={s.id} s={s} catName={catName} indent />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

/** Reorder a saved pack's colors; each drop is saved straight away. */
function ReorderList({ items }: { items: Supply[] }) {
  const [order, setOrder] = useState(items.map((s) => s.id))
  const byId = new Map(items.map((s) => [s.id, s]))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)))
    setOrder(next)
    void reorderSet(items, next)
  }
  const name = (id: string) => byId.get(id)?.color || byId.get(id)?.name || ''
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${name(String(active.id))}.`,
          onDragOver: ({ over }) => (over ? `Moving to position ${order.indexOf(String(over.id)) + 1} of ${order.length}.` : ''),
          onDragEnd: ({ over }) => (over ? `Dropped at position ${order.indexOf(String(over.id)) + 1}.` : 'Dropped.'),
          onDragCancel: () => 'Move cancelled.',
        },
      }}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-stone-100">
          {order.map((id, i) => (
            <ReorderRow key={id} id={id} index={i} label={name(id)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function ReorderRow({ id, index, label }: { id: string; index: number; label: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 bg-stone-50 py-2 pl-8 pr-3 ${isDragging ? 'relative z-10 bg-brand-50 shadow-lg ring-2 ring-brand-500' : ''}`}
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
      <span className="font-semibold">{label}</span>
    </li>
  )
}

export default function Inventory() {
  const supplies = useSupplies()
  const cats = useCategoryMap()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [openSets, setOpenSets] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const toggleSet = (id: string) =>
    setOpenSets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try {
      return (localStorage.getItem('cc-inventory-view') as 'list' | 'grid') || 'list'
    } catch {
      return 'list'
    }
  })

  const catName = (id: string) => cats.get(id)?.name ?? 'Other'
  const locations = useMemo(() => [...new Set((supplies ?? []).map((s) => s.location).filter(Boolean) as string[])].sort(), [supplies])
  const usedCats = useMemo(() => [...new Set((supplies ?? []).map((s) => s.category))], [supplies])

  if (!supplies) return <Spinner />
  const shown = filterSupplies(supplies, q, category, location, catName)

  const setViewSaved = (v: 'list' | 'grid') => {
    setView(v)
    try {
      localStorage.setItem('cc-inventory-view', v)
    } catch {
      // private mode: fine
    }
  }

  return (
    <div>
      <Sheet open={scanning} onClose={() => setScanning(false)} title="Scan to find it">
        {scanning && (
          <ScannerView
            onResult={(code) => {
              setQ(code)
              setScanning(false)
            }}
          />
        )}
      </Sheet>
      <PageHeader title="My stash" subtitle={`${supplies.length} suppl${supplies.length === 1 ? 'y' : 'ies'}`} action={<ButtonLink to="/add">➕ Add</ButtonLink>} />

      {supplies.length === 0 ? (
        <EmptyState title="Your stash is empty">
          <p className="mb-4">Add your vinyl, cardstock, blanks and other supplies so CraftCue knows what you have.</p>
          <ButtonLink to="/add">Add your first supply</ButtonLink>
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <label className="sr-only" htmlFor="inv-search">
              Search your stash
            </label>
            <div className="flex gap-2">
              <input id="inv-search" type="search" className={inputClass} placeholder="🔍 Search, or scan a barcode" value={q} onChange={(e) => setQ(e.target.value)} />
              <Button variant="secondary" aria-label="Scan a barcode to find it" onClick={() => setScanning(true)}>
                📷
              </Button>
            </div>
            <label className="sr-only" htmlFor="inv-cat">
              Filter by type
            </label>
            <select id="inv-cat" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All types</option>
              {usedCats.map((c) => (
                <option key={c} value={c}>
                  {catName(c)}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="inv-loc">
              Filter by location
            </label>
            <select id="inv-loc" className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} disabled={!locations.length}>
              <option value="">All places</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <div className="flex rounded-xl border-2 border-stone-300 bg-white" role="group" aria-label="View">
              {(['list', 'grid'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setViewSaved(v)} className={`min-h-11 flex-1 px-3 font-semibold ${view === v ? 'bg-brand-100 text-brand-800' : ''}`}>
                  {v === 'list' ? 'List' : 'Grid'}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <EmptyState title="Nothing matches">Try a different word or clear the filters.</EmptyState>
          ) : view === 'list' ? (
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
              {groupStash(shown).map((entry) =>
                entry.kind === 'single' ? (
                  <SupplyRow key={entry.supply.id} s={entry.supply} catName={catName} />
                ) : (
                  <SetRow key={entry.setId} entry={entry} open={Boolean(q.trim()) || openSets.has(entry.setId)} onToggle={() => toggleSet(entry.setId)} catName={catName} />
                ),
              )}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                  <Link to={`/supply/${s.id}`} className="flex flex-col gap-2">
                    {s.thumbnail ? (
                      <img src={s.thumbnail} alt="" className="aspect-square w-full rounded-xl object-cover" />
                    ) : (
                      <span aria-hidden className="flex h-24 w-full items-center justify-center rounded-xl bg-brand-50 text-4xl">
                        {categoryIcon(s.category)}
                      </span>
                    )}
                    <span className="font-semibold leading-tight">{s.name}</span>
                    <span className="text-sm text-stone-600">{[s.color, s.dimensions].filter(Boolean).join(' · ') || catName(s.category)}</span>
                  </Link>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-1">
                    <QuickQty s={s} />
                    <LevelBadge s={s} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
