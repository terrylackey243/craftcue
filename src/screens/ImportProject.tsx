import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { useCategories, useSetup } from '../hooks'
import PhotoDrop from '../components/PhotoDrop'
import { unitLabel } from '../components/SupplyForm'
import { useAiGate } from '../components/useAiGate'
import { Button, Card, Field, Notice, PageHeader, Spinner, Stepper, inputClass } from '../components/ui'
import { friendlyError } from '../lib/ai/aiClient'
import { colorLabel } from '../lib/colorGuess'
import { nameForHex } from '../lib/colorList'
import { makeThumbnail, makeVisionImage } from '../lib/images'
import { analyzeSvgs, closestSupplies, amountFor, type ColorPart, type SvgAnalysis } from '../lib/import/materials'
import { saveProject } from '../lib/repo'
import type { MissingItem, Supply, SupplyUse } from '../types'

/** Materials you cut a design from (the "what will you cut it from?" choice). */
const CUT_FROM = ['cardstock-paper', 'adhesive-vinyl', 'iron-on', 'felt', 'fabric', 'leather', 'foil-sheets', 'printable']

interface Row {
  key: string
  hex: string
  label: string
  part?: ColorPart // from a cut file; absent for photo estimates
  supplyId: string
  amount: number
  unit: string
  tooBig: number
}

interface Extra {
  key: string
  item: string
  supplyId: string
  amount: number
  unit: string
  estCost: string
}

let seq = 0
const key = () => `r${++seq}`

/** /projects/import — bring in a project found elsewhere, from its cut files and/or a photo. */
export default function ImportProject() {
  const navigate = useNavigate()
  const setup = useSetup()
  const categories = useCategories()
  const stored = useLiveQuery(() => db.supplies.toArray(), [])
  const supplies = useMemo(() => stored ?? [], [stored])
  const { guard, panel } = useAiGate()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [url, setUrl] = useState('')
  const [license, setLicense] = useState('')
  const [photo, setPhoto] = useState<{ file: File; thumb: string } | null>(null)
  const [files, setFiles] = useState<{ name: string; text: string }[]>([])
  const [scale, setScale] = useState(1)
  const [cutFrom, setCutFrom] = useState('cardstock-paper')
  const [rows, setRows] = useState<Row[]>([])
  const [extras, setExtras] = useState<Extra[]>([])
  const [minutes, setMinutes] = useState(60)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<'' | 'photo' | 'save'>('')
  const [error, setError] = useState('')
  const svgInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  const candidates = useMemo(() => supplies.filter((s) => s.category === cutFrom), [supplies, cutFrom])
  const byId = useMemo(() => new Map(supplies.map((s) => [s.id, s])), [supplies])
  const analysis: SvgAnalysis | null = useMemo(() => {
    if (!files.length) return null
    try {
      return analyzeSvgs(files, scale)
    } catch {
      return null
    }
  }, [files, scale])
  const base = useMemo(() => (files.length ? analyzeSvgs(files, 1) : null), [files])

  /** Rows for each color in the cut files, matched to the closest stash color. */
  function rowsFromSvg(a: SvgAnalysis, pool: Supply[]): Row[] {
    return a.colors.map((part) => {
      const best = closestSupplies(part.hex, pool)[0]
      const supplyId = best && best.distance < 140 ? best.supply.id : ''
      const s = supplyId ? byId.get(supplyId) : undefined
      const use = s ? amountFor(part, s) : { amount: 1, unit: 'sheet', tooBig: 0 }
      return { key: key(), hex: part.hex, label: nameForHex(part.hex), part, supplyId, amount: use.amount, unit: use.unit, tooBig: use.tooBig }
    })
  }

  async function addSvg(f: File) {
    setError('')
    const text = await f.text()
    const next = [...files.filter((x) => x.name !== f.name), { name: f.name, text }]
    try {
      const a = analyzeSvgs(next, scale)
      if (!a.colors.length) return setError(`No cut shapes were found in ${f.name}. Is it the SVG cut file?`)
      setFiles(next)
      setRows(rowsFromSvg(a, candidates))
      if (!title) setTitle(f.name.replace(/\.svg$/i, '').replace(/[-_]+/g, ' '))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function resize(widthIn: number) {
    if (!base || !base.widthIn || !(widthIn > 0)) return
    const s = widthIn / base.widthIn
    setScale(s)
    const a = analyzeSvgs(files, s)
    // Keep each row's chosen material; just re-work how much it takes.
    setRows((rs) =>
      rs.map((r, i) => {
        const part = a.colors[i]
        const sup = byId.get(r.supplyId)
        if (!part || !sup) return { ...r, part: part ?? r.part }
        const use = amountFor(part, sup)
        return { ...r, part, amount: use.amount, unit: use.unit, tooBig: use.tooBig }
      }),
    )
  }

  function chooseMaterial(rowKey: string, supplyId: string) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== rowKey) return r
        const s = byId.get(supplyId)
        if (!s) return { ...r, supplyId: '' }
        const use = r.part ? amountFor(r.part, s) : { amount: r.amount, unit: s.unit, tooBig: 0 }
        return { ...r, supplyId, amount: use.amount, unit: use.unit, tooBig: use.tooBig }
      }),
    )
  }

  function changeCutFrom(cat: string) {
    setCutFrom(cat)
    if (analysis) setRows(rowsFromSvg(analysis, supplies.filter((s) => s.category === cat)))
  }

  async function estimate() {
    if (!photo || !setup) return
    setBusy('photo')
    setError('')
    try {
      const { estimateFromPhoto } = await import('../lib/ai/importPhoto')
      const est = await estimateFromPhoto(await makeVisionImage(photo.file), supplies, setup.quality)
      if (!title) setTitle(est.title)
      if (!summary) setSummary(est.summary)
      setMinutes(Math.max(5, Math.round(est.estMinutes / 5) * 5))
      setNotes(est.notes)
      // Cut files are exact; the photo only fills in colors when there are no files.
      if (!files.length)
        setRows(
          est.colors.map((c) => ({ key: key(), hex: c.hex, label: `${c.name}${c.usedFor ? ` (${c.usedFor})` : ''}`, supplyId: c.supplyId, amount: Math.max(1, Math.ceil(c.sheets)), unit: byId.get(c.supplyId)?.unit ?? 'sheet', tooBig: 0 })),
        )
      setExtras(est.extras.map((x) => ({ key: key(), item: x.item, supplyId: x.supplyId, amount: x.amount > 0 ? x.amount : 1, unit: byId.get(x.supplyId)?.unit ?? x.unit, estCost: x.estCost })))
    } catch (e) {
      setError(friendlyError(e).message)
    } finally {
      setBusy('')
    }
  }

  async function save() {
    if (!title.trim()) return setError('Give the project a name.')
    setBusy('save')
    const uses: SupplyUse[] = []
    const missing: MissingItem[] = []
    for (const r of rows) {
      const s = byId.get(r.supplyId)
      if (s) uses.push({ supplyId: s.id, amount: r.amount, unit: r.unit })
      else missing.push({ item: `${categories.find((c) => c.id === cutFrom)?.name ?? 'Material'}, ${r.label.toLowerCase()}`, why: `${r.amount} ${unitLabel(r.unit, r.amount)} for one`, estCost: '' })
    }
    for (const x of extras) {
      const s = byId.get(x.supplyId)
      if (s) uses.push({ supplyId: s.id, amount: x.amount, unit: x.unit })
      else missing.push({ item: x.item, why: `${x.amount} ${x.unit} for one`, estCost: x.estCost })
    }
    const p = await saveProject({
      title: title.trim(),
      summary: summary.trim(),
      goal: 'sell',
      goalContext: {},
      status: 'planned',
      estMinutes: minutes,
      uses,
      missing,
      toolsNeeded: [],
      equipmentNeeded: [],
      steps: [],
      designTips: notes,
      safetyNotes: [],
      aiGenerated: false,
      photoThumb: photo?.thumb,
      source: { url: url.trim() || undefined, license: license.trim() || undefined, files: files.map((f) => f.name) },
    })
    navigate(`/projects/${p.id}`)
  }

  const allOptions = (r: Row) => {
    const close = r.part || r.hex ? closestSupplies(r.hex, candidates.length ? candidates : supplies) : []
    const rest = (candidates.length ? candidates : supplies).filter((s) => !close.some((c) => c.supply.id === s.id)).sort((a, b) => (a.color ?? a.name).localeCompare(b.color ?? b.name))
    return { close: close.map((c) => c.supply), rest }
  }
  const supplyLabel = (s: Supply) => `${colorLabel(s) ? `${colorLabel(s)} — ` : ''}${s.name}${s.dimensions ? ` (${s.dimensions})` : ''}${s.quantity > 0 ? '' : ' · none left'}`

  if (!setup) return <Spinner />

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {panel}
      <PageHeader title="Add a project you found" subtitle="From a cut file (SVG) you bought or downloaded, and/or a photo of the finished piece. We'll work out the materials, the cost and a price." />

      <Card>
        <h2 className="mb-2 text-xl font-bold">1. The cut files</h2>
        <p className="mb-3 text-stone-700">Best results: the SVG files give the exact pieces and sizes. Nothing leaves your device.</p>
        <input ref={svgInput} type="file" accept=".svg,image/svg+xml" multiple aria-label="SVG cut files" className="sr-only" onChange={(e) => Array.from(e.target.files ?? []).forEach((f) => void addSvg(f))} />
        <PhotoDrop kind="svg" onFile={(f) => void addSvg(f)}>
          <Button variant="secondary" onClick={() => svgInput.current?.click()}>
            📂 Choose SVG files
          </Button>
        </PhotoDrop>
        {files.length > 0 && analysis && (
          <div className="mt-3 flex flex-col gap-2">
            <p>
              {files.map((f) => f.name).join(', ')}: {analysis.colors.length} colors, {analysis.colors.reduce((n, c) => n + c.pieces.length, 0)} pieces, finished size about{' '}
              <strong>
                {analysis.widthIn.toFixed(1)} × {analysis.heightIn.toFixed(1)} in
              </strong>
              .
            </p>
            {analysis.sizeAssumed && <Notice tone="warn">The file doesn't say its real size, so we used Design Space's usual size. If you'll cut it bigger or smaller, set the width below.</Notice>}
            {analysis.skipped > 0 && <p className="text-sm text-stone-600">{analysis.skipped} part(s) use effects we can't measure (gradients or pictures) and were left out.</p>}
            <Field label="Width you'll cut it at (inches)">
              {(id) => <input id={id} type="number" inputMode="decimal" step={0.25} min={1} className={`${inputClass} max-w-32`} defaultValue={base?.widthIn.toFixed(2)} onBlur={(e) => resize(Number(e.target.value))} />}
            </Field>
            <Button variant="ghost" className="self-start" onClick={() => { setFiles([]); setRows([]); setScale(1) }}>
              Remove the files
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-xl font-bold">2. A photo (optional)</h2>
        <p className="mb-3 text-stone-700">A photo of the finished piece: yours, or the designer's. It's kept as the project picture, and smart suggestions can estimate the extras (like tea lights or glue) and the time it takes.</p>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          aria-label="Photo of the finished project"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) setPhoto({ file: f, thumb: (await makeThumbnail(f)).dataUrl })
          }}
        />
        <PhotoDrop onFile={async (f) => setPhoto({ file: f, thumb: (await makeThumbnail(f)).dataUrl })}>
          <div className="flex flex-wrap items-center gap-3">
            {photo && <img src={photo.thumb} alt="The finished project" className="h-24 w-24 rounded-xl object-cover" />}
            <Button variant="secondary" onClick={() => photoInput.current?.click()}>
              📷 {photo ? 'Change photo' : 'Choose a photo'}
            </Button>
          </div>
        </PhotoDrop>
        {photo && (
          <div className="mt-3 flex flex-col gap-2">
            {busy === 'photo' ? (
              <Spinner label="Looking at your photo… this takes about half a minute." />
            ) : (
              <Button className="self-start" onClick={() => guard(() => void estimate())}>
                ✨ Estimate {files.length ? 'extras and time' : 'materials, extras and time'} from the photo
              </Button>
            )}
            <p className="text-sm text-stone-500">Uses smart suggestions: a few cents.</p>
          </div>
        )}
      </Card>

      {(rows.length > 0 || extras.length > 0) && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">3. What it uses (for one)</h2>
          <Field label="What will you cut it from?">
            {(id) => (
              <select id={id} className={inputClass} value={cutFrom} onChange={(e) => changeCutFrom(e.target.value)}>
                {CUT_FROM.map((c) => (
                  <option key={c} value={c}>
                    {categories.find((x) => x.id === c)?.name ?? c}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <ul className="mt-3 flex flex-col gap-3">
            {rows.map((r) => {
              const { close, rest } = allOptions(r)
              return (
                <li key={r.key} className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3">
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="inline-block h-5 w-5 shrink-0 rounded-full ring-1 ring-stone-300" style={{ background: r.hex }} aria-hidden />
                    {r.label}
                    {r.part && (
                      <span className="font-normal text-stone-600">
                        · {r.part.pieces.length} piece{r.part.pieces.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                  <label className="sr-only" htmlFor={`m-${r.key}`}>
                    Material for {r.label}
                  </label>
                  <select id={`m-${r.key}`} className={inputClass} value={r.supplyId} onChange={(e) => chooseMaterial(r.key, e.target.value)}>
                    <option value="">Not in my stash (add to shopping list)</option>
                    <optgroup label="Closest colors">
                      {close.map((s) => (
                        <option key={s.id} value={s.id}>
                          {supplyLabel(s)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Everything else">
                      {rest.map((s) => (
                        <option key={s.id} value={s.id}>
                          {supplyLabel(s)}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="flex flex-wrap items-center gap-2">
                    <Stepper label={`amount of ${r.label}`} value={r.amount} onChange={(n) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount: n } : x)))} />
                    <span>{unitLabel(r.unit, r.amount)}</span>
                  </div>
                  {r.tooBig > 0 && <Notice tone="warn">{r.tooBig} piece(s) are bigger than this material. Pick a bigger size, or cut it smaller.</Notice>}
                </li>
              )
            })}
          </ul>

          {extras.length > 0 && (
            <>
              <h3 className="mt-4 font-semibold">Extras</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {extras.map((x) => (
                  <li key={x.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 p-3">
                    <span className="flex-1 font-medium">
                      {x.supplyId ? supplyLabel(byId.get(x.supplyId)!) : x.item}
                      {!x.supplyId && <span className="block text-sm font-normal text-stone-600">Not in your stash{x.estCost ? `, about ${x.estCost}` : ''}: goes on your shopping list.</span>}
                    </span>
                    <Stepper label={`amount of ${x.item}`} value={x.amount} onChange={(n) => setExtras((xs) => xs.map((e) => (e.key === x.key ? { ...e, amount: n } : e)))} />
                    <span>{unitLabel(x.unit, x.amount)}</span>
                    <button type="button" aria-label={`Remove ${x.item}`} className="min-h-11 min-w-11 rounded-full text-stone-500 hover:bg-stone-100" onClick={() => setExtras((xs) => xs.filter((e) => e.key !== x.key))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-sm text-stone-600">Sheets are counted the way the mat preview lays pieces out, rounded up to whole sheets. You can add more (like glue) on the project afterwards.</p>
          {notes && <Notice tone="info">{notes}</Notice>}
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-xl font-bold">{rows.length || extras.length ? '4' : '3'}. About it</h2>
        <div className="flex flex-col gap-3">
          <Field label="Name">{(id) => <input id={id} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ghost campfire scene" />}</Field>
          <Field label="Short description (optional)">{(id) => <input id={id} className={inputClass} value={summary} onChange={(e) => setSummary(e.target.value)} />}</Field>
          <div className="flex flex-col gap-1">
            <p className="font-semibold">How long one takes you (minutes)</p>
            <Stepper label="minutes to make one" value={minutes} step={15} onChange={(n) => setMinutes(Math.max(5, n))} />
            <p className="text-sm text-stone-600">Cutting, weeding and putting it together. Used to price your time.</p>
          </div>
          <Field label="Where you found it (optional)">{(id) => <input id={id} type="url" className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />}</Field>
          <Field label="The designer's terms of use (optional)" hint="Paste them here so they stay with the project, e.g. whether you may sell what you make.">
            {(id) => <textarea id={id} rows={4} className={`${inputClass} py-2`} value={license} onChange={(e) => setLicense(e.target.value)} />}
          </Field>
        </div>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!title.trim() || busy !== ''} onClick={() => void save()}>
          Save project
        </Button>
        <Button variant="ghost" onClick={() => navigate('/projects')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
