import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { deletePerson, savePerson } from '../lib/repo'
import { Button, ButtonLink, Card, EmptyState, Field, PageHeader, Sheet, Spinner, inputClass } from '../components/ui'
import type { Person } from '../types'

type Draft = { id?: string; name: string; relationship: string; ageRange: string; interests: string; notes: string }

const blank: Draft = { name: '', relationship: '', ageRange: '', interests: '', notes: '' }

export default function People() {
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), [])
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? []
  const [editing, setEditing] = useState<Draft | null>(null)

  if (!people) return <Spinner />
  const titleOf = (id: string) => projects.find((p) => p.id === id)?.title

  const open = (p?: Person) =>
    setEditing(p ? { id: p.id, name: p.name, relationship: p.relationship ?? '', ageRange: p.ageRange ?? '', interests: p.interests.join(', '), notes: p.notes ?? '' } : blank)

  return (
    <div>
      <PageHeader title="People" subtitle="Save the people you make gifts for, so ideas fit them and never repeat." action={<Button onClick={() => open()}>➕ Add person</Button>} />
      {people.length === 0 ? (
        <EmptyState title="No one saved yet">Add someone you like making things for: their interests help us pick good gift ideas.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.id}>
              <Card className="flex h-full flex-col gap-2">
                <h2 className="text-xl font-bold">{p.name}</h2>
                <p className="text-stone-600">{[p.relationship, p.ageRange].filter(Boolean).join(' · ')}</p>
                {p.interests.length > 0 && <p>Likes: {p.interests.join(', ')}</p>}
                {p.pastGiftProjectIds.length > 0 && (
                  <p className="text-sm text-stone-600">
                    Made for them:{' '}
                    {p.pastGiftProjectIds
                      .map((id) => titleOf(id))
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <ButtonLink to="/suggest/gift" variant="secondary">
                    Gift ideas
                  </ButtonLink>
                  <Button variant="ghost" onClick={() => open(p)}>
                    Edit
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-stone-600">
        Tip: pick the person on the <Link to="/suggest/gift" className="font-semibold text-brand-700 underline">Make a gift</Link> screen.
      </p>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit person' : 'Add a person'}>
        {editing && (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!editing.name.trim()) return
              await savePerson({
                id: editing.id,
                name: editing.name.trim(),
                relationship: editing.relationship.trim() || undefined,
                ageRange: editing.ageRange.trim() || undefined,
                interests: editing.interests.split(',').map((s) => s.trim()).filter(Boolean),
                notes: editing.notes.trim() || undefined,
              })
              setEditing(null)
            }}
          >
            <Field label="Name">{(id) => <input id={id} className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            <Field label="Relationship">
              {(id) => <input id={id} className={inputClass} placeholder="e.g. sister, coworker" value={editing.relationship} onChange={(e) => setEditing({ ...editing, relationship: e.target.value })} />}
            </Field>
            <Field label="Age range">
              {(id) => <input id={id} className={inputClass} placeholder="e.g. 5–7, teen, 60s" value={editing.ageRange} onChange={(e) => setEditing({ ...editing, ageRange: e.target.value })} />}
            </Field>
            <Field label="Interests" hint="Separate with commas.">
              {(id) => <input id={id} className={inputClass} placeholder="gardening, cats, coffee" value={editing.interests} onChange={(e) => setEditing({ ...editing, interests: e.target.value })} />}
            </Field>
            <Field label="Notes">
              {(id) => <textarea id={id} rows={2} className={`${inputClass} py-2`} placeholder="Favorite colors, style, sizes…" value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!editing.name.trim()}>
                Save
              </Button>
              {editing.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (window.confirm(`Remove ${editing.name}? Projects you made for them stay.`)) {
                      await deletePerson(editing.id!)
                      setEditing(null)
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </form>
        )}
      </Sheet>
    </div>
  )
}
