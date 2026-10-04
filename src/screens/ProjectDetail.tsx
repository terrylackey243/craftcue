import { unitStep } from '../lib/units'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { getTool } from '../data'
import { applyMade, afterDeduction, proposeDeductions, type DeductionRow } from '../lib/deduction'
import { deleteProject, updateProject } from '../lib/repo'
import { makeThumbnail } from '../lib/images'
import DesignView from '../components/DesignView'
import { formatQty, unitLabel } from '../components/SupplyForm'
import { toSupplyUnit } from '../lib/units'
import { Badge, Button, Card, Field, Notice, Sheet, Spinner, Stepper, fieldClass, inputClass } from '../components/ui'
import { EQUIPMENT, type Project, type ProjectStatus, type Supply } from '../types'
import { useSetupEditor } from '../hooks'
import { DEFAULT_HOURLY_RATE, DEFAULT_PROFIT_PCT, ETSY, priceProject } from '../lib/pricing'
import { formatMoney } from '../lib/money'
import { GOAL_LABEL, STATUS_LABEL } from './Projects'
import PhotoDrop from '../components/PhotoDrop'
import { colorLabel } from '../lib/colorGuess'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const project = useLiveQuery(() => (id ? db.projects.get(id) : undefined), [id])
  const supplies = useLiveQuery(() => db.supplies.toArray(), []) ?? []
  const person = useLiveQuery(() => (project?.personId ? db.people.get(project.personId) : undefined), [project?.personId])
  const [making, setMaking] = useState(false)
  const [addingUse, setAddingUse] = useState(false)

  if (project === undefined) return <Spinner />
  if (!project) return <Notice tone="error">Project not found.</Notice>
  const byId = new Map(supplies.map((s) => [s.id, s]))
  const p = project

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link to="/projects" className="font-semibold text-brand-700 underline">
          ← Projects
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{p.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone="brand">{GOAL_LABEL[p.goal]}</Badge>
          {person && <Badge>for {person.name}</Badge>}
          {p.difficulty && <Badge>{'★'.repeat(Math.round(p.difficulty))} difficulty</Badge>}
          {p.estMinutes && <Badge>about {p.estMinutes < 90 ? `${p.estMinutes} min` : `${Math.round(p.estMinutes / 60)} hr`}</Badge>}
          {p.madeCount ? <Badge tone="good">made {p.madeCount}×</Badge> : null}
          {p.aiGenerated && <Badge>AI idea</Badge>}
          {p.source && <Badge>found elsewhere</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="status" className="font-semibold">
          Status
        </label>
        <select id="status" className={`${fieldClass} w-auto`} value={p.status} onChange={(e) => updateProject(p.id, { status: e.target.value as ProjectStatus })}>
          {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <Button className="ml-auto" onClick={() => setMaking(true)}>
          ✅ Mark as made
        </Button>
      </div>

      {p.summary && <p className="text-lg">{p.summary}</p>}
      {p.whyItFits && <p className="text-stone-600">💡 {p.whyItFits}</p>}

      <DesignView project={p} supplies={supplies} />

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-bold">Materials from your stash</h2>
          <Button variant="ghost" onClick={() => setAddingUse(true)}>
            + Add
          </Button>
        </div>
        {p.uses.length === 0 ? (
          <p className="text-stone-600">None listed.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {p.uses.map((u, i) => {
              const s = byId.get(u.supplyId)
              return (
                <li key={`${u.supplyId}-${i}`} className="flex flex-wrap items-center gap-2 py-2">
                  {s ? (
                    <Link to={`/supply/${s.id}`} className="flex-1 font-semibold underline-offset-2 hover:underline">
                      {s.name}
                      {colorLabel(s) ? ` — ${colorLabel(s)}` : ''}
                    </Link>
                  ) : (
                    <span className="flex-1 text-stone-500">(no longer in your stash)</span>
                  )}
                  <span className="text-stone-700">{formatQty(u.amount, u.unit)} each</span>
                  {s && (
                    <Badge tone={s.quantity >= (toSupplyUnit(u.amount, u.unit, s) ?? u.amount) ? 'good' : 'warn'}>
                      you have {formatQty(s.quantity, s.unit)}
                    </Badge>
                  )}
                  <button
                    type="button"
                    aria-label="Remove material"
                    className="min-h-11 min-w-11 rounded-full text-stone-500 hover:bg-stone-100"
                    onClick={() => updateProject(p.id, { uses: p.uses.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {p.missing.length > 0 && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">You'll also need</h2>
          <ul className="flex flex-col gap-2">
            {p.missing.map((m, i) => (
              <li key={i}>
                <span className="font-semibold">{m.item}</span>
                {m.estCost && <span className="text-stone-600"> (~{m.estCost})</span>}
                {m.why && <span className="block text-sm text-stone-600">{m.why}</span>}
              </li>
            ))}
          </ul>
          {p.status !== 'made' && p.status !== 'dismissed' && (
            <p className="mt-3 text-sm text-stone-600">
              These are on your <Link to="/shopping" className="font-semibold text-brand-700 underline">shopping list</Link>.
            </p>
          )}
        </Card>
      )}

      {(p.toolsNeeded.length > 0 || p.equipmentNeeded.length > 0) && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">Tools & equipment</h2>
          <ul className="list-disc pl-6">
            {p.toolsNeeded.map((t) => (
              <li key={t}>{getTool(t)?.name ?? t}</li>
            ))}
            {p.equipmentNeeded.map((e) => (
              <li key={e}>{EQUIPMENT.find((x) => x.id === e)?.name ?? e}</li>
            ))}
          </ul>
        </Card>
      )}

      {p.steps.length > 0 && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">Steps</h2>
          <ol className="list-decimal space-y-2 pl-6">
            {p.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Card>
      )}

      {p.designTips && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">Design tips</h2>
          <p className="whitespace-pre-line">{p.designTips}</p>
        </Card>
      )}

      <PricingCard project={p} supplies={supplies} />

      {p.source && (p.source.url || p.source.license || p.source.files?.length) && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">Where it's from</h2>
          {p.source.url && (
            <p>
              <a href={p.source.url} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-brand-700 underline">
                {p.source.url}
              </a>
            </p>
          )}
          {p.source.files && p.source.files.length > 0 && <p className="text-stone-700">Cut files: {p.source.files.join(', ')}</p>}
          {p.source.license && (
            <div className="mt-2">
              <h3 className="font-semibold">Designer's terms of use</h3>
              <p className="whitespace-pre-line text-stone-700">{p.source.license}</p>
            </div>
          )}
        </Card>
      )}

      {p.sellInfo && (p.sellInfo.priceLow || p.sellInfo.unitCostEst) && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">Selling (smart suggestion's estimate)</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {p.sellInfo.unitCostEst && (
              <>
                <dt className="font-semibold">Materials per item</dt>
                <dd>{p.sellInfo.unitCostEst}</dd>
              </>
            )}
            {p.sellInfo.priceLow && (
              <>
                <dt className="font-semibold">Suggested price</dt>
                <dd>
                  {p.sellInfo.priceLow} – {p.sellInfo.priceHigh}
                </dd>
              </>
            )}
          </dl>
          {p.sellInfo.batchNotes && <p className="mt-2 text-stone-700">{p.sellInfo.batchNotes}</p>}
        </Card>
      )}

      {p.safetyNotes.length > 0 && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <h2 className="mb-2 text-xl font-bold text-amber-900">⚠ Safety</h2>
          <ul className="list-disc space-y-1 pl-6 text-amber-900">
            {p.safetyNotes.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <h2 className="mb-2 text-xl font-bold">Your notes</h2>
        <NotesEditor project={p} />
        <div className="mt-3">
        <PhotoDrop onFile={async (f) => updateProject(p.id, { photoThumb: (await makeThumbnail(f)).dataUrl })}>
        <div className="flex items-center gap-3">
          {p.photoThumb && <img src={p.photoThumb} alt="Finished project" className="h-24 w-24 rounded-xl object-cover" />}
          <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border-2 border-brand-200 bg-white px-4 font-semibold text-brand-700">
            {p.photoThumb ? 'Change photo' : 'Add a photo of it'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) updateProject(p.id, { photoThumb: (await makeThumbnail(f)).dataUrl })
              }}
            />
          </label>
        </div>
        </PhotoDrop>
        </div>
      </Card>

      <Button
        variant="danger"
        className="self-start"
        onClick={async () => {
          if (window.confirm(`Delete the project “${p.title}”? Your supplies aren't affected.`)) {
            await deleteProject(p.id)
            navigate('/projects', { replace: true })
          }
        }}
      >
        Delete project
      </Button>

      <MarkMadeSheet open={making} onClose={() => setMaking(false)} project={p} />
      <AddUseSheet open={addingUse} onClose={() => setAddingUse(false)} project={p} />
    </div>
  )
}

/** Materials (stash prices) + your time + profit = a price; plus what to ask on Etsy to cover its fees. */
function PricingCard({ project: p, supplies }: { project: Project; supplies: Supply[] }) {
  const [setup, patch] = useSetupEditor()
  if (!setup) return null
  const b = priceProject(p, supplies, setup)
  const rate = setup.hourlyRate ?? DEFAULT_HOURLY_RATE
  const pct = setup.profitPct ?? DEFAULT_PROFIT_PCT
  return (
    <Card>
      <h2 className="mb-2 text-xl font-bold">Price it</h2>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">How long one takes you (minutes)</p>
          <Stepper label="minutes to make one" value={p.estMinutes ?? 0} step={15} onChange={(n) => void updateProject(p.id, { estMinutes: Math.max(0, n) })} />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 font-semibold">
            Your time, per hour
            <span className="flex items-center gap-1 font-normal">
              $<input inputMode="decimal" className={`${fieldClass} w-24`} value={rate} onChange={(e) => patch({ hourlyRate: Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0) })} />
            </span>
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            Profit on top
            <span className="flex items-center gap-1 font-normal">
              <input inputMode="numeric" className={`${fieldClass} w-20`} value={pct} onChange={(e) => patch({ profitPct: Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0) })} />%
            </span>
          </label>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-stone-50 p-3">
          <dt>Materials (your stash prices)</dt>
          <dd className="text-right">{formatMoney(b.materials)}</dd>
          <dt>Your time</dt>
          <dd className="text-right">{formatMoney(b.labor)}</dd>
          <dt>Profit ({pct}%)</dt>
          <dd className="text-right">{formatMoney(b.profit)}</dd>
          <dt className="border-t border-stone-200 pt-1 text-lg font-bold">Price (craft fair, in person)</dt>
          <dd className="border-t border-stone-200 pt-1 text-right text-lg font-bold">{formatMoney(b.price)}</dd>
          <dt className="font-semibold">On Etsy</dt>
          <dd className="text-right font-semibold">{formatMoney(b.etsyPrice)}</dd>
        </dl>
        <p className="text-sm text-stone-600">
          The Etsy price covers its fees (about {Math.round(ETSY.pct * 1000) / 10}% plus ${ETSY.flat.toFixed(2)} a sale) so you still get {formatMoney(b.price)}. Shipping and packaging are extra.
        </p>
        {b.unpriced.length > 0 && <Notice tone="warn">No price yet for: {b.unpriced.join(', ')}. Add what you paid on those items (or the pack) so the total is right.</Notice>}
      </div>
    </Card>
  )
}

function NotesEditor({ project }: { project: Project }) {
  const [text, setText] = useState(project.userNotes ?? '')
  return (
    <>
      <label htmlFor="notes" className="sr-only">
        Your notes
      </label>
      <textarea
        id="notes"
        rows={3}
        className={`${inputClass} py-2`}
        value={text}
        placeholder="What worked, what you'd change, who liked it…"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (project.userNotes ?? '') && updateProject(project.id, { userNotes: text })}
      />
    </>
  )
}

function MarkMadeSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const supplies = useLiveQuery(() => db.supplies.toArray(), []) ?? []
  const initialCount = project.goal === 'sell' && 'howMany' in project.goalContext ? Number(project.goalContext.howMany) || 1 : 1
  const [count, setCount] = useState(initialCount)
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map())
  const [done, setDone] = useState(false)

  const rows: DeductionRow[] = proposeDeductions(project, supplies, count).map((r) => (overrides.has(r.supplyId) ? { ...r, amount: overrides.get(r.supplyId)! } : r))

  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose()
        setDone(false)
      }}
      title="Mark as made"
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <Notice tone="success">🎉 Nice work! Your stash has been updated.</Notice>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">How many did you make?</span>
            <Stepper
              label="how many made"
              value={count}
              onChange={(n) => {
                setCount(Math.max(1, Math.round(n)))
                setOverrides(new Map())
              }}
            />
          </div>
          {rows.length > 0 ? (
            <>
              <p>We'll take these out of your stash. Change any amount if you used more or less.</p>
              <ul className="flex flex-col gap-3">
                {rows.map((r) => (
                  <li key={r.supplyId} className="rounded-xl bg-stone-50 p-3">
                    <p className="font-semibold">{r.name}</p>
                    {!r.missing && (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Stepper label={`amount of ${r.name} used`} value={r.amount} step={unitStep(r.unit)} onChange={(n) => setOverrides((m) => new Map(m).set(r.supplyId, n))} />
                        <span className="text-sm text-stone-600">
                          {unitLabel(r.unit, r.amount)} · {formatQty(r.available, r.unit)} → {afterDeduction(r.available, r.amount)} left
                        </span>
                      </div>
                    )}
                    {!r.missing && r.amount > r.available && <p className="mt-1 text-sm text-amber-900">That's more than you have. It will go down to 0.</p>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-stone-600">No stash materials are listed on this project, so nothing will be taken out.</p>
          )}
          <p className="text-sm text-stone-600">Nothing changes until you tap Confirm.</p>
          <Button
            className="min-h-14 text-lg"
            onClick={async () => {
              await applyMade(project.id, rows, count)
              setDone(true)
              setOverrides(new Map())
            }}
          >
            Confirm
          </Button>
        </div>
      )}
    </Sheet>
  )
}

function AddUseSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const supplies = useLiveQuery(() => db.supplies.orderBy('name').toArray(), []) ?? []
  const [supplyId, setSupplyId] = useState('')
  const [amount, setAmount] = useState(1)
  const s = supplies.find((x) => x.id === supplyId)
  return (
    <Sheet open={open} onClose={onClose} title="Add a material from your stash">
      <div className="flex flex-col gap-4">
        <Field label="Supply">
          {(id) => (
            <select id={id} className={inputClass} value={supplyId} onChange={(e) => setSupplyId(e.target.value)}>
              <option value="">Choose…</option>
              {supplies.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.color ? ` — ${x.color}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
        {s && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">Amount for one</span>
            <Stepper label="amount" value={amount} step={unitStep(s.unit)} onChange={setAmount} />
            <span>{unitLabel(s.unit, amount)}</span>
          </div>
        )}
        <Button
          disabled={!s || !(amount > 0)}
          onClick={async () => {
            await updateProject(project.id, { uses: [...project.uses, { supplyId: s!.id, amount, unit: s!.unit }] })
            setSupplyId('')
            setAmount(1)
            onClose()
          }}
        >
          Add
        </Button>
      </div>
    </Sheet>
  )
}
