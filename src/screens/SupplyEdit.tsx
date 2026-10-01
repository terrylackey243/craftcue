import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import SupplyForm, { emptyDraft } from '../components/SupplyForm'
import AssortmentForm from '../components/AssortmentForm'
import { Button, ButtonLink, Chip, Notice, PageHeader, Spinner } from '../components/ui'
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
            <p className="text-sm text-stone-600">Changes below are for this color only. To change something for every color (price, size, low-stock warning, barcode…), edit the pack.</p>
            <ButtonLink to={`/pack/${existing.setId}`} variant="secondary" className="self-start">
              ✏️ Edit the whole pack
            </ButtonLink>
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

