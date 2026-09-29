import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db'
import imageModels from '../data/imageModels.json'
import type { Project, Supply } from '../types'
import { guessHex } from '../lib/colorGuess'
import { downloadBlob, svgFilename } from '../lib/design/export'
import { layoutSheet, renderSheet, toStoredImage } from '../lib/addons/stickers'
import { buildVectorDesign, vectorPrompt, type ColorPick } from '../lib/addons/vectorDesign'
import { deleteArtwork, saveArtwork, updateProject } from '../lib/repo'
import { useCategoryMap } from '../hooks'
import { Button, Chip, Field, Notice, Spinner, inputClass } from './ui'

const cents = (usd: number) => `${Math.round(usd * 100)} cents`
const CUTTABLE = ['adhesive-vinyl', 'iron-on', 'cardstock-paper', 'felt', 'fabric', 'leather', 'foil-sheets']
const MAX_COLORS = 6

function startingIdea(project: Project): string {
  return `${project.title}. ${project.summary}`.slice(0, 400)
}

// ----- illustrated vinyl (Recraft) -----

/** Illustrated multi-color art from Recraft, split into cut layers in the crafter's own colors. */
export function VectorArtPanel({ project, supplies }: { project: Project; supplies: Supply[] }) {
  const categories = useCategoryMap()
  const usedCats = useMemo(() => {
    const byId = new Map(supplies.map((s) => [s.id, s]))
    return project.uses.map((u) => byId.get(u.supplyId)?.category).filter((c): c is string => Boolean(c && CUTTABLE.includes(c)))
  }, [project, supplies])
  const [category, setCategory] = useState(usedCats[0] ?? 'adhesive-vinyl')
  const [idea, setIdea] = useState(() => startingIdea(project))
  const [picks, setPicks] = useState<ColorPick[]>([])
  const [sizeIn, setSizeIn] = useState(6)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const available = supplies.filter((s) => s.category === category && s.quantity > 0)
  const catChoices = CUTTABLE.filter((c) => supplies.some((s) => s.category === c && s.quantity > 0))
  const toggle = (s: Supply) =>
    setPicks((p) => (p.some((x) => x.supply.id === s.id) ? p.filter((x) => x.supply.id !== s.id) : p.length >= MAX_COLORS ? p : [...p, { supply: s, hex: guessHex(s.color || s.name) }]))
  const sameColor = new Set(picks.map((p) => p.hex.toLowerCase())).size < picks.length

  async function make() {
    setBusy(true)
    setError('')
    try {
      const { makeVectorArt } = await import('../lib/addons/recraft')
      const prompt = vectorPrompt(idea)
      const svg = await makeVectorArt(prompt, picks.map((p) => p.hex))
      const design = buildVectorDesign(svg, picks, sizeIn, project.title, prompt)
      await updateProject(project.id, { design, designedAt: new Date().toISOString() })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (busy) return <Spinner label="Drawing your artwork… this usually takes 10 to 30 seconds." />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-stone-700">Recraft draws an illustration using only the colors you pick, and CraftCue turns each color into its own cut layer.</p>
      <Field label="What should it show?">{(id) => <textarea id={id} className={`${inputClass} min-h-24 py-2`} value={idea} onChange={(e) => setIdea(e.target.value)} />}</Field>
      {catChoices.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Material type">
          {catChoices.map((c) => (
            <Chip key={c} selected={c === category} onClick={() => setCategory(c)}>
              {categories.get(c)?.name ?? c}
            </Chip>
          ))}
        </div>
      )}
      <fieldset>
        <legend className="font-semibold">Colors to use (up to {MAX_COLORS})</legend>
        {available.length === 0 ? (
          <p className="text-sm text-stone-600">No materials of this type in your stash yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {available.map((s) => {
              const pick = picks.find((p) => p.supply.id === s.id)
              const label = [s.color, s.name].filter(Boolean).join(' — ')
              return (
                <li key={s.id} className="flex min-h-12 items-center gap-3">
                  <input id={`pick-${s.id}`} type="checkbox" className="h-6 w-6" checked={Boolean(pick)} onChange={() => toggle(s)} disabled={!pick && picks.length >= MAX_COLORS} />
                  <label htmlFor={`pick-${s.id}`} className="flex-1">
                    {label}
                  </label>
                  {pick && (
                    <input
                      type="color"
                      aria-label={`Color for ${label}`}
                      className="h-10 w-14 rounded"
                      value={pick.hex}
                      onChange={(e) => setPicks((ps) => ps.map((p) => (p.supply.id === s.id ? { ...p, hex: e.target.value } : p)))}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {picks.length > 0 && <p className="mt-1 text-sm text-stone-600">Adjust a swatch if it doesn't look like your material.</p>}
      </fieldset>
      <Field label="Size (longest side, inches)">
        {(id) => <input id={id} type="number" inputMode="decimal" min={1} max={24} step={0.5} className={`${inputClass} max-w-32`} value={sizeIn} onChange={(e) => setSizeIn(Math.max(1, Math.min(24, Number(e.target.value) || 6)))} />}
      </Field>
      {sameColor && <Notice tone="warn">Two of your colors have the same swatch. Change one so they become separate layers.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Button className="self-start" disabled={!picks.length || !idea.trim() || sameColor} onClick={() => void make()}>
        🖌 Make vinyl artwork
      </Button>
      <p className="text-sm text-stone-500">Uses your Recraft account: about {cents(imageModels.recraft.estUsdPerImage)}. Replaces the design above.</p>
    </div>
  )
}

// ----- illustrated stickers (OpenAI) -----

export function stickerPrompt(idea: string): string {
  return `${idea.trim()}. Die-cut sticker artwork: one single subject, centered, bold clean shapes, rich colors, crisp edges, transparent background, no border, no text unless it is asked for above.`
}

const SIZES = [1.5, 2, 2.5, 3, 4]

/** Illustrated sticker art from OpenAI, laid out on a Print Then Cut sheet. */
export function StickerPanel({ project }: { project: Project }) {
  const artwork = useLiveQuery(() => db.artwork.where('projectId').equals(project.id).sortBy('createdAt'), [project.id])
  const [idea, setIdea] = useState(() => startingIdea(project))
  const [count, setCount] = useState(2)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [sizeIn, setSizeIn] = useState(2)
  const [busy, setBusy] = useState<'' | 'make' | 'sheet'>('')
  const [error, setError] = useState('')
  const slots = layoutSheet(sizeIn)
  const fit = slots.length
  const sheetW = fit ? Math.max(...slots.map((s) => s.x)) + sizeIn : 0
  const selected = (artwork ?? []).filter((a) => chosen.has(a.id))

  async function make() {
    setBusy('make')
    setError('')
    try {
      const { makeStickerArt } = await import('../lib/addons/openaiImages')
      const prompt = stickerPrompt(idea)
      const pngs = await makeStickerArt(prompt, count)
      const ids: string[] = []
      for (const png of pngs) ids.push((await saveArtwork({ projectId: project.id, kind: 'sticker', image: await toStoredImage(png), prompt })).id)
      setChosen((c) => new Set([...c, ...ids]))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  async function sheet() {
    setBusy('sheet')
    setError('')
    try {
      downloadBlob(await renderSheet(selected.map((a) => a.image), sizeIn), svgFilename(`${project.title} stickers`).replace(/\.svg$/, '.png'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-stone-700">OpenAI paints sticker art with a see-through background. CraftCue adds a white edge and lays the stickers out on a sheet for Print Then Cut.</p>
      <Field label="What should the stickers show?">{(id) => <textarea id={id} className={`${inputClass} min-h-24 py-2`} value={idea} onChange={(e) => setIdea(e.target.value)} />}</Field>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="How many to make">
        <span className="font-semibold">How many to make:</span>
        {[1, 2, 3, 4].map((n) => (
          <Chip key={n} selected={n === count} onClick={() => setCount(n)}>
            {n}
          </Chip>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {busy === 'make' ? (
        <Spinner label="Painting your stickers… this can take up to a minute." />
      ) : (
        <>
          <Button className="self-start" disabled={!idea.trim() || busy !== ''} onClick={() => void make()}>
            ✨ Make sticker art
          </Button>
          <p className="text-sm text-stone-500">Uses your OpenAI account: about {cents(imageModels.openai.estUsdPerImage * count)}.</p>
        </>
      )}

      {artwork && artwork.length > 0 && (
        <>
          <h3 className="font-semibold">Your sticker art (tap to put it on the sheet)</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {artwork.map((a, i) => {
              const on = chosen.has(a.id)
              return (
                <li key={a.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Sticker ${i + 1}`}
                    onClick={() => setChosen((c) => (c.has(a.id) ? new Set([...c].filter((x) => x !== a.id)) : new Set([...c, a.id])))}
                    className={`rounded-xl bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2 ${on ? 'ring-4 ring-brand-500' : 'ring-1 ring-stone-300'}`}
                  >
                    <img src={a.image} alt="" className="aspect-square w-full object-contain" />
                  </button>
                  <Button variant="ghost" className="text-sm" onClick={() => void deleteArtwork(a.id)}>
                    Remove
                  </Button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sticker size">
            <span className="font-semibold">Sticker size:</span>
            {SIZES.map((s) => (
              <Chip key={s} selected={s === sizeIn} onClick={() => setSizeIn(s)}>
                {s} in
              </Chip>
            ))}
          </div>
          <p className="text-sm text-stone-600">
            {fit} stickers fit on one Print Then Cut sheet at {sizeIn} in{selected.length > 1 ? `; your ${selected.length} designs take turns filling it` : ''}.
          </p>
          <Button className="self-start" disabled={!selected.length || busy !== ''} onClick={() => void sheet()}>
            {busy === 'sheet' ? 'Making the sheet…' : '⬇ Download sticker sheet (PNG)'}
          </Button>
          <details className="rounded-xl bg-stone-50 p-3">
            <summary className="cursor-pointer font-semibold">How to print and cut the stickers</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-6">
              <li>In Design Space, choose Upload, then Upload Image, and pick the sheet you downloaded.</li>
              <li>Choose “Print Then Cut image” and upload it, then add it to the canvas.</li>
              <li>
                Select it and set its width to <strong>{sheetW} in</strong> (keep the lock closed so the height follows). That makes each sticker {sizeIn} in.
              </li>
              <li>Tap Make It. Design Space prints the sheet with registration marks on your home printer.</li>
              <li>Put the printed sticker paper on the mat as shown and let the machine cut around each sticker.</li>
            </ol>
          </details>
        </>
      )}
    </div>
  )
}
