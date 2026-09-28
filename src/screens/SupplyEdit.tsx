import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import SupplyForm, { emptyDraft } from '../components/SupplyForm'
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

  if (id && existing === undefined) return <Spinner />
  if (id && existing === null) return <Notice tone="error">That supply wasn't found. It may have been deleted.</Notice>

  if (existing) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Edit supply" />
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
      {savedName && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Notice tone="success">Saved “{savedName}”. Add another?</Notice>
          <Button variant="secondary" onClick={() => navigate('/inventory')}>
            I'm done
          </Button>
        </div>
      )}
      <SupplyForm
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
      />
    </div>
  )
}
