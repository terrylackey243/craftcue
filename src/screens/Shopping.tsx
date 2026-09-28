import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { buildShoppingList, shoppingText } from '../lib/shopping'
import { nowIso } from '../lib/ids'
import { Badge, Button, EmptyState, Notice, PageHeader, Spinner } from '../components/ui'

export default function Shopping() {
  const data = useLiveQuery(async () => {
    const [projects, supplies, checks] = await Promise.all([db.projects.toArray(), db.supplies.toArray(), db.shoppingChecks.toArray()])
    return { lines: buildShoppingList(projects, supplies), checked: new Set(checks.map((c) => c.key)) }
  }, [])
  const [msg, setMsg] = useState('')

  if (!data) return <Spinner />
  const { lines, checked } = data

  async function share() {
    const text = shoppingText(lines, checked)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CraftCue shopping list', text })
        return
      }
      await navigator.clipboard.writeText(text)
      setMsg('Copied! Paste it into a text message or your notes.')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg("Couldn't share. Try again.")
    }
  }

  const toggle = async (key: string) => {
    if (checked.has(key)) await db.shoppingChecks.delete(key)
    else await db.shoppingChecks.put({ key, checkedAt: nowIso() })
  }

  return (
    <div>
      <PageHeader
        title="Shopping list"
        subtitle="Things your saved projects need, plus supplies that are running low."
        action={
          lines.length > 0 ? (
            <Button variant="secondary" onClick={share}>
              📤 Share list
            </Button>
          ) : undefined
        }
      />
      {msg && <div className="mb-3"><Notice tone="success">{msg}</Notice></div>}
      {lines.length === 0 ? (
        <EmptyState title="Nothing to buy">
          When a saved <Link to="/projects" className="font-semibold text-brand-700 underline">project</Link> needs something you don't have, or a supply runs
          low, it shows up here.
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {lines.map((l) => {
              const on = checked.has(l.key)
              return (
                <li key={l.key}>
                  <label className="flex min-h-16 cursor-pointer items-start gap-3 p-3">
                    <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-brand-600" checked={on} onChange={() => toggle(l.key)} />
                    <span className={`flex-1 ${on ? 'text-stone-400 line-through' : ''}`}>
                      <span className="block font-semibold">
                        {l.item}
                        {l.estCost && <span className="font-normal text-stone-600"> (~{l.estCost})</span>}
                      </span>
                      <span className="block text-sm">{l.detail}</span>
                    </span>
                    {l.kind === 'out' && <Badge tone="bad">Out</Badge>}
                    {l.kind === 'low' && <Badge tone="warn">Low</Badge>}
                  </label>
                </li>
              )
            })}
          </ul>
          {checked.size > 0 && (
            <Button variant="ghost" className="mt-3" onClick={() => db.shoppingChecks.clear()}>
              Untick everything
            </Button>
          )}
          <p className="mt-3 text-sm text-stone-600">Bought something? Add it to your stash and it will drop off this list.</p>
        </>
      )}
    </div>
  )
}
