import { useEffect, useMemo, useState } from 'react'
import type { Project, Supply } from '../types'
import type { Design } from '../lib/design/spec'
import { renderDesign, type RenderedDesign, type RenderedLayer } from '../lib/design/render'
import { checkDesign, type CheckResult } from '../lib/design/checks'
import { downloadText, exportSvg, svgFilename } from '../lib/design/export'
import { bbox, boxH, boxW, linesOn, linesToPathD, pieces, shapeToPathD, UNITS_PER_IN } from '../lib/design/geometry'
import { effectiveMachine } from '../data'
import { useCategoryMap, useSetup } from '../hooks'
import { friendlyError } from '../lib/ai/aiClient'
import { updateProject } from '../lib/repo'
import { useAiGate } from './useAiGate'
import { Button, Card, Chip, Notice, Spinner, inputClass } from './ui'

const IN = UNITS_PER_IN

/** The design section of a project: create, view, change and download a cut-ready design. */
export default function DesignView({ project, supplies }: { project: Project; supplies: Supply[] }) {
  const setup = useSetup()
  const categories = useCategoryMap()
  const { guard, panel } = useAiGate()
  const [busy, setBusy] = useState<'' | 'new' | 'change'>('')
  const [error, setError] = useState('')
  const [change, setChange] = useState('')
  const [view, setView] = useState<'mockup' | 'layers'>('mockup')
  const [shown, setShown] = useState<{ rendered: RenderedDesign; check: CheckResult } | null>(null)
  const design = project.design

  // Draw the saved design on this device (fonts load on first use).
  useEffect(() => {
    let live = true
    if (!design || !setup) {
      setShown(null)
      return
    }
    renderDesign(design)
      .then((rendered) => {
        if (live) setShown({ rendered, check: checkDesign(rendered, { machine: effectiveMachine(setup), supplies, mode: design.mode }) })
      })
      .catch(() => live && setError("Couldn't draw this design."))
    return () => {
      live = false
    }
  }, [design, setup, supplies])

  async function run(kind: 'new' | 'change') {
    if (!setup) return
    setBusy(kind)
    setError('')
    try {
      const { designProject } = await import('../lib/ai/design')
      const result = await designProject({
        project,
        supplies,
        categories,
        setup,
        refine: kind === 'change' && design ? { previous: design, request: change } : undefined,
      })
      await updateProject(project.id, { design: result.design, designedAt: new Date().toISOString() })
      setChange('')
    } catch (e) {
      setError(friendlyError(e).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <Card>
      {panel}
      <h2 className="mb-2 text-xl font-bold">Design</h2>
      {!design && !busy && (
        <div className="flex flex-col gap-3">
          <p className="text-stone-700">Get a ready-to-cut design for this project, drawn to fit your machine and your materials, with a picture of how it will look and a file for Design Space.</p>
          <Button className="self-start" onClick={() => guard(() => void run('new'))}>
            🎨 Design it for me
          </Button>
          <p className="text-sm text-stone-500">Uses smart suggestions: about 2 to 5 cents.</p>
        </div>
      )}
      {busy && <Spinner label={busy === 'change' ? 'Changing the design…' : 'Designing… this usually takes 10 to 30 seconds.'} />}
      {error && <Notice tone="error">{error}</Notice>}

      {design && shown && !busy && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show the design as">
            <Chip selected={view === 'mockup'} onClick={() => setView('mockup')}>
              Mock-up
            </Chip>
            <Chip selected={view === 'layers'} onClick={() => setView('layers')}>
              Cut layers
            </Chip>
          </div>
          {view === 'mockup' ? <Mockup design={design} rendered={shown.rendered} supplies={supplies} /> : <Layers rendered={shown.rendered} supplies={supplies} />}
          <p className="text-sm text-stone-600">
            {design.widthIn} × {design.heightIn} in · {shown.rendered.layers.filter((l) => l.shape.length || l.lines.length).length} layers
            {design.mode === 'print-then-cut' ? ' · Print Then Cut' : ''}
          </p>

          {shown.check.problems.length > 0 && (
            <Notice tone="warn">
              <p className="font-semibold">Before you cut:</p>
              <ul className="list-disc pl-5">
                {shown.check.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Notice>
          )}
          {shown.check.cautions.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-amber-900">
              {shown.check.cautions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => downloadText(exportSvg(shown.rendered, design.title), svgFilename(design.title))}>⬇ Download SVG for Design Space</Button>
            {design.mode === 'print-then-cut' && (
              <Button variant="secondary" onClick={() => void downloadPrintPng(shown.rendered, design.title)}>
                ⬇ Download PNG to print
              </Button>
            )}
          </div>

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (change.trim()) guard(() => void run('change'))
            }}
          >
            <label htmlFor="design-change" className="font-semibold">
              Change something
            </label>
            <div className="flex gap-2">
              <input id="design-change" className={inputClass} value={change} onChange={(e) => setChange(e.target.value)} placeholder="e.g. bigger letters, add a heart, use the red cardstock" />
              <Button type="submit" variant="secondary" disabled={!change.trim()}>
                Change
              </Button>
            </div>
          </form>
          <Button variant="ghost" className="self-start" onClick={() => guard(() => void run('new'))}>
            ↻ Try a different design
          </Button>

          {design.assembly.length > 0 && (
            <div>
              <h3 className="font-semibold">Putting it together</h3>
              <ol className="list-decimal space-y-1 pl-6">
                {design.assembly.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          <DesignSpaceHelp rendered={shown.rendered} printThenCut={design.mode === 'print-then-cut'} />
        </div>
      )}
    </Card>
  )
}

// ----- mock-up -----

function Mockup({ design, rendered, supplies }: { design: Design; rendered: RenderedDesign; supplies: Supply[] }) {
  const byId = new Map(supplies.map((s) => [s.id, s]))
  const W = rendered.widthIn * IN
  const H = rendered.heightIn * IN
  // Paper layers get a small shadow so stacked pieces read as layers.
  const paper = (l: RenderedLayer) => byId.get(l.supplyId)?.category === 'cardstock-paper' || byId.get(l.supplyId)?.category === 'felt'
  const pad = Math.max(W, H) * 0.14
  const frame = frameFor(design.product, W, H, pad)
  return (
    <svg viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`} className="w-full max-w-xl rounded-xl bg-[#ece6dc]" role="img" aria-label={`Mock-up of ${design.title}`}>
      <defs>
        <filter id="layer-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx={W * 0.004} dy={W * 0.006} stdDeviation={W * 0.004} floodOpacity="0.3" />
        </filter>
        <filter id="item-shadow">
          <feDropShadow dx="0" dy={W * 0.012} stdDeviation={W * 0.015} floodOpacity="0.3" />
        </filter>
      </defs>
      {frame}
      {rendered.layers
        .filter((l) => (l.operation === 'cut' || l.operation === 'print') && l.shape.length)
        .map((l) => (
          <path key={l.id} d={shapeToPathD(l.shape)} fill={l.color} fillRule="nonzero" filter={paper(l) ? 'url(#layer-shadow)' : undefined} />
        ))}
      {rendered.layers
        .filter((l) => l.operation === 'draw' && l.lines.length)
        .map((l) => (
          <path key={l.id} d={linesToPathD(l.lines)} fill="none" stroke={l.color} strokeWidth={W * 0.003} strokeLinecap="round" />
        ))}
    </svg>
  )
}

function frameFor(product: Design['product'], W: number, H: number, pad: number) {
  const r = Math.min(W, H) * 0.02
  switch (product) {
    case 'wall-art':
      return (
        <g filter="url(#item-shadow)">
          <rect x={-pad * 0.6} y={-pad * 0.6} width={W + pad * 1.2} height={H + pad * 1.2} fill="#3a2a1d" />
          <rect x={0} y={0} width={W} height={H} fill="#fbfaf5" />
        </g>
      )
    case 'sign':
      return <rect x={-pad * 0.35} y={-pad * 0.35} width={W + pad * 0.7} height={H + pad * 0.7} rx={r} fill="#c9a77c" filter="url(#item-shadow)" />
    case 'mug':
    case 'tumbler':
      return (
        <g filter="url(#item-shadow)">
          <path d={`M${W + pad * 0.3} ${H * 0.2} q${pad * 0.9} 0 ${pad * 0.9} ${H * 0.3} q0 ${H * 0.3} ${-pad * 0.9} ${H * 0.3}`} fill="none" stroke="#f4f2ee" strokeWidth={pad * 0.35} />
          <rect x={-pad * 0.4} y={-pad * 0.5} width={W + pad * 0.8} height={H + pad} rx={pad * 0.3} fill="#f4f2ee" />
        </g>
      )
    case 't-shirt':
    case 'tote':
    case 'pillow':
      return <rect x={-pad * 0.7} y={-pad * 0.7} width={W + pad * 1.4} height={H + pad * 1.4} rx={pad * 0.4} fill={product === 'tote' ? '#e8dcc2' : '#d9dde3'} filter="url(#item-shadow)" />
    case 'card':
      return <rect x={-pad * 0.2} y={-pad * 0.2} width={W + pad * 0.4} height={H + pad * 0.4} fill="#fffdf8" filter="url(#item-shadow)" />
    default:
      return <rect x={-pad * 0.25} y={-pad * 0.25} width={W + pad * 0.5} height={H + pad * 0.5} rx={r} fill="#fbfaf5" filter="url(#item-shadow)" />
  }
}

// ----- cut layers -----

function Layers({ rendered, supplies }: { rendered: RenderedDesign; supplies: Supply[] }) {
  const byId = new Map(supplies.map((s) => [s.id, s]))
  const score = rendered.layers.filter((l) => (l.operation === 'score' || l.operation === 'draw') && l.lines.length)
  const cut = rendered.layers.filter((l) => (l.operation === 'cut' || l.operation === 'print') && l.shape.length)
  const W = rendered.widthIn * IN
  const H = rendered.heightIn * IN
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {cut.map((l) => {
        const parts = pieces(l.shape)
        const b = bbox(l.shape)
        const s = byId.get(l.supplyId)
        return (
          <li key={l.id} className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <p className="flex items-center gap-2 font-semibold">
              <span className="inline-block h-4 w-4 rounded-full ring-1 ring-stone-300" style={{ background: l.color }} aria-hidden />
              {l.name}
            </p>
            <p className="text-sm text-stone-600">
              {l.operation === 'print' ? 'Printed' : `${parts.length} piece${parts.length === 1 ? '' : 's'}`} · {(boxW(b) / IN).toFixed(1)} × {(boxH(b) / IN).toFixed(1)} in
              {s?.dimensions ? ` · from ${s.dimensions}` : ''}
            </p>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full rounded bg-stone-50" role="img" aria-label={`${l.name} pieces`}>
              <path d={shapeToPathD(l.shape)} fill={l.color} stroke="#0003" strokeWidth={W * 0.002} />
              {/* Only the score lines that land on this layer's pieces (the top-most layer they touch). */}
              {score.map((sc) => {
                const mine = linesOn(sc.lines, l.shape).filter((line) => !cut.slice(cut.indexOf(l) + 1).some((above) => linesOn([line], above.shape).length))
                return mine.length ? <path key={sc.id} d={linesToPathD(mine)} fill="none" stroke="#1d4ed8" strokeWidth={W * 0.003} strokeDasharray={`${W * 0.01} ${W * 0.008}`} /> : null
              })}
            </svg>
          </li>
        )
      })}
      {score.map((l) => (
        <li key={l.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-stone-200">
          <span className="font-semibold">{l.name}</span>: {l.lines.length} {l.operation === 'score' ? 'score' : 'pen'} line{l.lines.length === 1 ? '' : 's'} (dashed blue)
        </li>
      ))}
    </ul>
  )
}

// ----- Design Space help -----

function DesignSpaceHelp({ rendered, printThenCut }: { rendered: RenderedDesign; printThenCut: boolean }) {
  const hasScore = rendered.layers.some((l) => l.operation === 'score' && l.lines.length)
  const hasDraw = rendered.layers.some((l) => l.operation === 'draw' && l.lines.length)
  const steps = useMemo(() => {
    const s = ['In Design Space, choose Upload, then Upload Image, and pick the SVG you downloaded.', 'Upload it, then select it and Add to Canvas. It keeps its real size, and each color is its own layer.']
    if (hasScore) s.push('Select the score lines layer, change its Operation to Score, then select it together with the piece it belongs to and tap Attach so the lines stay in place.')
    if (hasDraw) s.push('Select the pen lines layer, change its Operation to Pen, choose your pen color, then Attach it to its piece.')
    if (printThenCut) s.push('For Print Then Cut, upload the PNG instead and choose “Print Then Cut image”. Design Space prints it and cuts around it.')
    s.push('Tap Make It. Each color goes on its own mat, so load the matching material when asked.')
    return s
  }, [hasScore, hasDraw, printThenCut])
  return (
    <details className="rounded-xl bg-stone-50 p-3">
      <summary className="cursor-pointer font-semibold">How to use this in Design Space</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-6">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </details>
  )
}

// ----- Print Then Cut PNG -----

async function downloadPrintPng(rendered: RenderedDesign, title: string) {
  const dpi = 300
  const scale = dpi / IN
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(rendered.widthIn * dpi)
  canvas.height = Math.round(rendered.heightIn * dpi)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(scale, scale)
  for (const l of rendered.layers) {
    if (l.operation !== 'print' || !l.shape.length) continue
    ctx.fillStyle = l.color
    ctx.fill(new Path2D(shapeToPathD(l.shape)), 'nonzero')
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = svgFilename(title).replace(/\.svg$/, '.png')
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
