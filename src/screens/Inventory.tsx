import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCategoryMap, useSupplies } from '../hooks'
import { adjustQuantity } from '../lib/repo'
import { stockLevel } from '../lib/shopping'
import { Badge, ButtonLink, EmptyState, PageHeader, Spinner, inputClass } from '../components/ui'
import { unitLabel } from '../components/SupplyForm'
import type { Supply } from '../types'
import { categoryIcon } from '../data/categories'

export function filterSupplies(supplies: Supply[], q: string, category: string, location: string, categoryName: (id: string) => string): Supply[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return supplies.filter((s) => {
    if (category && s.category !== category) return false
    if (location && (s.location ?? '') !== location) return false
    if (!words.length) return true
    const hay = [s.name, s.color, s.brand, s.subtype, s.finish, s.dimensions, s.location, s.notes, categoryName(s.category)].join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

function LevelBadge({ s }: { s: Supply }) {
  const level = stockLevel(s)
  if (level === 'out') return <Badge tone="bad">Out</Badge>
  if (level === 'low') return <Badge tone="warn">Low</Badge>
  return null
}

function QuickQty({ s }: { s: Supply }) {
  const step = s.unit === 'ft' || s.unit === 'yd' ? 0.5 : 1
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${s.name}`}>
      <button
        type="button"
        aria-label={`Use one ${s.name}`}
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
        aria-label={`Add one ${s.name}`}
        className="min-h-11 min-w-11 rounded-lg border-2 border-stone-300 bg-white text-xl font-bold hover:border-brand-500"
        onClick={() => adjustQuantity(s.id, step)}
      >
        +
      </button>
    </div>
  )
}

export default function Inventory() {
  const supplies = useSupplies()
  const cats = useCategoryMap()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
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
            <input id="inv-search" type="search" className={inputClass} placeholder="🔍 Search (e.g. pink vinyl)" value={q} onChange={(e) => setQ(e.target.value)} />
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
              {shown.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                  {s.thumbnail ? (
                    <img src={s.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-2xl">
                      {categoryIcon(s.category)}
                    </span>
                  )}
                  <Link to={`/supply/${s.id}`} className="min-w-40 flex-1">
                    <span className="block font-semibold text-stone-900 underline-offset-2 hover:underline">{s.name}</span>
                    <span className="block text-sm text-stone-600">{[catName(s.category), s.color, s.dimensions, s.location].filter(Boolean).join(' · ')}</span>
                  </Link>
                  <LevelBadge s={s} />
                  <QuickQty s={s} />
                </li>
              ))}
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
