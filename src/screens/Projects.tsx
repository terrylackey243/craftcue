import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db'
import { saveProject } from '../lib/repo'
import { Badge, Button, ButtonLink, EmptyState, Field, PageHeader, Sheet, Spinner, inputClass } from '../components/ui'
import type { Goal, ProjectStatus } from '../types'

export const STATUS_LABEL: Record<ProjectStatus, string> = { idea: '💡 Idea', planned: '📌 Planned', made: '✅ Made', dismissed: 'Set aside' }
export const GOAL_LABEL: Record<Goal, string> = { sell: 'To sell', decor: 'Decor', gift: 'Gift' }

const FILTERS: { id: ProjectStatus | 'active'; label: string }[] = [
  { id: 'active', label: 'To do' },
  { id: 'made', label: 'Made' },
  { id: 'dismissed', label: 'Set aside' },
]

export default function Projects() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  const navigate = useNavigate()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('active')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState<Goal>('decor')

  if (!projects) return <Spinner />
  const shown = projects.filter((p) => (filter === 'active' ? p.status === 'idea' || p.status === 'planned' : p.status === filter))

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Ideas you've saved, what you're planning, and what you've made."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/projects/import" variant="secondary">
              📥 A project I found
            </ButtonLink>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              ➕ My own idea
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex gap-2" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-11 rounded-full px-4 font-semibold ${filter === f.id ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-300'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={filter === 'active' ? 'No projects yet' : 'Nothing here yet'}>
          {filter === 'active' && (
            <p>
              Go to <Link to="/" className="font-semibold text-brand-700 underline">Home</Link> and pick Sell, Decorate or Gift to get ideas, then save the ones you like.
            </p>
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="flex h-full gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200 hover:ring-brand-500">
                {p.photoThumb && <img src={p.photoThumb} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{p.title}</span>
                  <span className="flex flex-wrap gap-1">
                    <Badge>{STATUS_LABEL[p.status]}</Badge>
                    <Badge tone="brand">{GOAL_LABEL[p.goal]}</Badge>
                    {p.missing.length > 0 && p.status !== 'made' && <Badge tone="warn">needs {p.missing.length}</Badge>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add your own project idea">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!title.trim()) return
            const p = await saveProject({
              title: title.trim(),
              summary: '',
              goal,
              goalContext: {},
              status: 'idea',
              uses: [],
              missing: [],
              toolsNeeded: [],
              equipmentNeeded: [],
              steps: [],
              designTips: '',
              safetyNotes: [],
              aiGenerated: false,
            })
            setAdding(false)
            setTitle('')
            navigate(`/projects/${p.id}`)
          }}
        >
          <Field label="What is it?">{(id) => <input id={id} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pumpkin door sign" />}</Field>
          <Field label="It's for…">
            {(id) => (
              <select id={id} className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
                <option value="decor">Decorating</option>
                <option value="gift">A gift</option>
                <option value="sell">Selling</option>
              </select>
            )}
          </Field>
          <Button type="submit" disabled={!title.trim()}>
            Create project
          </Button>
        </form>
      </Sheet>
    </div>
  )
}
