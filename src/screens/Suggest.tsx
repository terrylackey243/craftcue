import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db } from '../db'
import { useCategoryMap, useSetup } from '../hooks'
import { recommend } from '../lib/ai/recommend'
import { friendlyError } from '../lib/ai/aiClient'
import type { CheckedSuggestion } from '../lib/ai/validate'
import { saveProject } from '../lib/repo'
import { useAiGate } from '../components/useAiGate'
import { Badge, Button, Card, Chip, Field, Notice, PageHeader, Spinner, inputClass } from '../components/ui'
import { getTool } from '../data'
import { EQUIPMENT, type Goal, type GoalRequest } from '../types'

const TITLES: Record<Goal, string> = { sell: 'Something to sell', decor: 'Decorate', gift: 'Make a gift' }

const TIMES = ['under 1 hour', 'an afternoon', 'a weekend', "no rush"]

interface Results {
  request: GoalRequest
  now: CheckedSuggestion[]
  needs: CheckedSuggestion[]
  note: string
}

// Keep the last results per goal while the app is open, so going to a project and back doesn't
// throw away suggestions the user paid for.
const lastResults = new Map<Goal, Results>()

function defaultRequest(goal: Goal): GoalRequest {
  const common = { onlyWhatIHave: false, maxDifficulty: 3, timeAvailable: 'an afternoon', count: 5 }
  if (goal === 'sell') return { ...common, goal, where: 'craft fair', howMany: 10 }
  if (goal === 'decor') return { ...common, goal, room: 'living room' }
  return { ...common, goal, occasion: 'birthday' }
}

export default function Suggest() {
  const goal = (useParams().goal ?? 'sell') as Goal
  const setup = useSetup()
  const cats = useCategoryMap()
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), []) ?? []
  const supplyCount = useLiveQuery(() => db.supplies.count(), [])
  const { guard, panel } = useAiGate()
  const [req, setReq] = useState<GoalRequest>(() => lastResults.get(goal)?.request ?? defaultRequest(goal))
  const [results, setResults] = useState<Results | undefined>(() => lastResults.get(goal))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Map<string, string>>(new Map())

  if (!setup || supplyCount === undefined) return <Spinner />
  const set = (patch: Partial<GoalRequest>) => setReq((r) => ({ ...r, ...patch }) as GoalRequest)

  async function run(request: GoalRequest, append = false) {
    setBusy(true)
    setError('')
    try {
      const supplies = await db.supplies.toArray()
      const person = request.goal === 'gift' && request.personId ? await db.people.get(request.personId) : undefined
      const avoid = new Set<string>()
      if (person) {
        const past = await db.projects.bulkGet(person.pastGiftProjectIds)
        past.forEach((p) => p && avoid.add(p.title))
      }
      if (append && results) [...results.now, ...results.needs].forEach((c) => avoid.add(c.suggestion.title))
      const out = await recommend({ setup: setup!, supplies, categories: cats, request, person, avoidTitles: [...avoid] })
      const next: Results = append && results
        ? { request: results.request, now: [...results.now, ...out.now], needs: [...results.needs, ...out.needs], note: out.note || results.note }
        : { request, now: out.now, needs: out.needs, note: out.note }
      lastResults.set(goal, next)
      setResults(next)
      if (!append) {
        setHidden(new Set())
        setSaved(new Map())
      }
    } catch (e) {
      setError(friendlyError(e).message)
    } finally {
      setBusy(false)
    }
  }

  async function save(c: CheckedSuggestion) {
    const s = c.suggestion
    const request = results!.request
    const p = await saveProject({
      title: s.title,
      summary: s.summary,
      whyItFits: s.whyItFits,
      goal,
      goalContext: request,
      personId: request.goal === 'gift' ? request.personId : undefined,
      status: 'idea',
      difficulty: s.difficulty,
      estMinutes: s.estMinutes,
      uses: s.uses,
      missing: s.missing,
      toolsNeeded: s.toolsNeeded,
      equipmentNeeded: s.equipmentNeeded,
      steps: s.steps,
      designTips: s.designTips,
      sellInfo: s.sellInfo ?? undefined,
      safetyNotes: s.safetyNotes,
      aiGenerated: true,
    })
    setSaved((m) => new Map(m).set(s.title, p.id))
  }

  function moreLike(c: CheckedSuggestion) {
    const base = results!.request
    void run({ ...base, count: 3, extra: `More ideas similar to “${c.suggestion.title}”: ${c.suggestion.summary}` } as GoalRequest, true)
  }

  const card = (c: CheckedSuggestion) => {
    const s = c.suggestion
    if (hidden.has(s.title)) return null
    const savedId = saved.get(s.title)
    return (
      <li key={s.title}>
        <Card className="flex h-full flex-col gap-3">
          <div>
            <h3 className="text-xl font-bold">{s.title}</h3>
            <p className="mt-1 text-stone-700">{s.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{'★'.repeat(Math.max(1, Math.min(5, Math.round(s.difficulty))))} difficulty</Badge>
            <Badge>about {s.estMinutes < 90 ? `${Math.round(s.estMinutes)} min` : `${Math.round(s.estMinutes / 60)} hr`}</Badge>
            {s.sellInfo?.priceLow && (
              <Badge tone="good">
                sell {s.sellInfo.priceLow}–{s.sellInfo.priceHigh}
              </Badge>
            )}
          </div>
          {s.whyItFits && <p className="text-sm text-stone-600">💡 {s.whyItFits}</p>}
          {c.issues.length > 0 && (
            <ul className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              {c.issues.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          )}
          {c.warnings.length > 0 && (
            <ul className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
              {c.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}
          {s.toolsNeeded.length > 0 && <p className="text-sm text-stone-600">Tools: {s.toolsNeeded.map((t) => getTool(t)?.name ?? t).join(', ')}</p>}
          {s.equipmentNeeded.length > 0 && <p className="text-sm text-stone-600">Equipment: {s.equipmentNeeded.map((e) => EQUIPMENT.find((x) => x.id === e)?.name ?? e).join(', ')}</p>}
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {savedId ? (
              <Link to={`/projects/${savedId}`} className="inline-flex min-h-12 items-center rounded-xl bg-leaf-50 px-4 font-semibold text-leaf-600">
                ✓ Saved — open
              </Link>
            ) : (
              <Button onClick={() => save(c)}>Save</Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => guard(() => moreLike(c))}>
              More like this
            </Button>
            {!savedId && (
              <Button variant="ghost" onClick={() => setHidden((h) => new Set(h).add(s.title))}>
                Dismiss
              </Button>
            )}
          </div>
        </Card>
      </li>
    )
  }

  const visibleNow = results?.now.filter((c) => !hidden.has(c.suggestion.title)) ?? []
  const visibleNeeds = results?.needs.filter((c) => !hidden.has(c.suggestion.title)) ?? []

  return (
    <div>
      {panel}
      <PageHeader title={TITLES[goal]} subtitle="Tell us a little, and we'll suggest projects from your stash." />

      {supplyCount === 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            Your stash is empty, so every idea will need shopping. <Link to="/add" className="font-semibold underline">Add some supplies first</Link> for better
            suggestions.
          </Notice>
        </div>
      )}

      <form
        className="flex flex-col gap-4 rounded-3xl bg-white p-4 ring-1 ring-stone-200"
        onSubmit={(e) => {
          e.preventDefault()
          guard(() => void run(req))
        }}
      >
        {req.goal === 'sell' && (
          <>
            <div>
              <p className="mb-2 font-semibold">Where will you sell?</p>
              <div className="flex flex-wrap gap-2">
                {(['craft fair', 'online', 'local shop', 'not sure'] as const).map((w) => (
                  <Chip key={w} selected={req.where === w} onClick={() => set({ where: w })}>
                    {w}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="How many to make?">
                {(id) => <input id={id} inputMode="numeric" className={inputClass} value={req.howMany} onChange={(e) => set({ howMany: Math.max(1, Number(e.target.value) || 1) })} />}
              </Field>
              <Field label="Price you're aiming for (optional)">
                {(id) => <input id={id} className={inputClass} placeholder="e.g. $10–15" value={req.priceTarget ?? ''} onChange={(e) => set({ priceTarget: e.target.value })} />}
              </Field>
              <Field label="Theme or season (optional)">
                {(id) => <input id={id} className={inputClass} placeholder="e.g. fall, teachers" value={req.theme ?? ''} onChange={(e) => set({ theme: e.target.value })} />}
              </Field>
            </div>
          </>
        )}

        {req.goal === 'decor' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Which room?">
              {(id) => <input id={id} className={inputClass} list="rooms" value={req.room} onChange={(e) => set({ room: e.target.value })} />}
            </Field>
            <datalist id="rooms">
              {['living room', 'kitchen', 'bedroom', 'kids room', 'bathroom', 'front door / porch', 'office', 'classroom'].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <Field label="Season or holiday (optional)">
              {(id) => <input id={id} className={inputClass} placeholder="e.g. Halloween, spring" value={req.season ?? ''} onChange={(e) => set({ season: e.target.value })} />}
            </Field>
            <Field label="Style (optional)">
              {(id) => <input id={id} className={inputClass} placeholder="farmhouse, modern, whimsical…" value={req.style ?? ''} onChange={(e) => set({ style: e.target.value })} />}
            </Field>
            <Field label="Size limits (optional)">
              {(id) => <input id={id} className={inputClass} placeholder="e.g. fits a 24 in shelf" value={req.sizeLimits ?? ''} onChange={(e) => set({ sizeLimits: e.target.value })} />}
            </Field>
          </div>
        )}

        {req.goal === 'gift' && (
          <>
            <Field label="Who is it for?" hint={<Link to="/people" className="font-semibold text-brand-700 underline">Manage saved people</Link>}>
              {(id) => (
                <select id={id} className={inputClass} value={req.personId ?? ''} onChange={(e) => set({ personId: e.target.value || undefined })}>
                  <option value="">Describe them below</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.relationship ? ` (${p.relationship})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {!req.personId && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Relationship">
                  {(id) => <input id={id} className={inputClass} placeholder="e.g. my sister" value={req.relationship ?? ''} onChange={(e) => set({ relationship: e.target.value })} />}
                </Field>
                <Field label="Age range">
                  {(id) => <input id={id} className={inputClass} placeholder="e.g. 30s, teen" value={req.ageRange ?? ''} onChange={(e) => set({ ageRange: e.target.value })} />}
                </Field>
                <Field label="Interests">
                  {(id) => <input id={id} className={inputClass} placeholder="gardening, coffee…" value={req.interests ?? ''} onChange={(e) => set({ interests: e.target.value })} />}
                </Field>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Occasion">
                {(id) => <input id={id} className={inputClass} list="occasions" value={req.occasion} onChange={(e) => set({ occasion: e.target.value })} />}
              </Field>
              <datalist id="occasions">
                {['birthday', 'Christmas', "Mother's Day", "Father's Day", 'wedding', 'baby shower', 'graduation', 'thank you', 'teacher appreciation', 'just because'].map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
              <Field label="Budget for extra supplies (optional)">
                {(id) => <input id={id} className={inputClass} placeholder="e.g. $10" value={req.budget ?? ''} onChange={(e) => set({ budget: e.target.value })} />}
              </Field>
            </div>
          </>
        )}

        <details className="rounded-xl bg-stone-50 p-3" open={req.onlyWhatIHave}>
          <summary className="cursor-pointer font-semibold">More options</summary>
          <div className="mt-3 flex flex-col gap-4">
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" className="h-6 w-6 accent-brand-600" checked={req.onlyWhatIHave} onChange={(e) => set({ onlyWhatIHave: e.target.checked })} />
              Only use what I have (no shopping)
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Hardest I want">
                {(id) => (
                  <select id={id} className={inputClass} value={req.maxDifficulty} onChange={(e) => set({ maxDifficulty: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {'★'.repeat(n)} {['very easy', 'easy', 'medium', 'tricky', 'advanced'][n - 1]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Time I have">
                {(id) => (
                  <select id={id} className={inputClass} value={req.timeAvailable} onChange={(e) => set({ timeAvailable: e.target.value })}>
                    {TIMES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Number of ideas">
                {(id) => (
                  <select id={id} className={inputClass} value={req.count} onChange={(e) => set({ count: Number(e.target.value) })}>
                    {[3, 5, 8].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </div>
        </details>

        <Button type="submit" disabled={busy} className="min-h-14 text-lg">
          ✨ {results ? 'Get new ideas' : 'Get ideas'}
        </Button>
      </form>

      {busy && (
        <div className="mt-6">
          <Spinner label="Thinking up ideas from your stash… this usually takes 30–60 seconds." />
        </div>
      )}
      {error && (
        <div className="mt-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {results && !busy && (
        <div className="mt-8 flex flex-col gap-8">
          {results.note && <Notice tone="info">{results.note}</Notice>}
          <section>
            <h2 className="mb-1 text-2xl font-bold">Make it now</h2>
            <p className="mb-3 text-stone-600">You have everything for these.</p>
            {visibleNow.length ? (
              <ul className="grid gap-4 md:grid-cols-2">{visibleNow.map(card)}</ul>
            ) : (
              <p className="rounded-2xl bg-white p-4 text-stone-700 ring-1 ring-stone-200">None this time. Try “Only use what I have”, or add more supplies.</p>
            )}
          </section>
          {visibleNeeds.length > 0 && (
            <section>
              <h2 className="mb-1 text-2xl font-bold">Needs one more thing</h2>
              <p className="mb-3 text-stone-600">Great ideas that need a supply, tool or bit of equipment you don't have yet.</p>
              <ul className="grid gap-4 md:grid-cols-2">{visibleNeeds.map(card)}</ul>
            </section>
          )}
          <p className="text-sm text-stone-500">Ideas are suggestions from AI. Check sizes and safety before you start. Saving an idea adds it to Projects.</p>
        </div>
      )}
    </div>
  )
}
