import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCategories, useSetup } from '../hooks'
import { makeThumbnail, makeVisionImage } from '../lib/images'
import { readSinglePhoto } from '../lib/ai/vision'
import { friendlyError } from '../lib/ai/aiClient'
import { cacheUpc } from '../lib/repo'
import { isValidUpc, normalizeUpc } from '../lib/upc'
import SupplyForm, { emptyDraft, type SupplyDraft } from '../components/SupplyForm'
import { useAiGate } from '../components/useAiGate'
import { Button, Notice, PageHeader, Spinner } from '../components/ui'
import type { Quality, Supply } from '../types'

type Kind = 'package' | 'loose'

export default function PhotoAdd() {
  const setup = useSetup()
  const categories = useCategories()
  const navigate = useNavigate()
  const { guard, panel } = useAiGate()
  const [kind, setKind] = useState<Kind>('package')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ draft: SupplyDraft; uncertain: Partial<Record<keyof Supply, string>>; triedHarder: boolean } | null>(null)
  const [savedName, setSavedName] = useState('')
  const [formKey, setFormKey] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  async function read(f: File, quality: Quality) {
    if (!setup) return
    setBusy(true)
    setError('')
    try {
      const [img, thumb] = await Promise.all([makeVisionImage(f), makeThumbnail(f)])
      const r = await readSinglePhoto(kind, img, categories, quality)
      setResult({ draft: { ...emptyDraft(), ...r.supply, thumbnail: thumb.dataUrl } as SupplyDraft, uncertain: r.uncertain, triedHarder: quality === 'best' })
      setFormKey((k) => k + 1)
    } catch (e) {
      setError(friendlyError(e).message)
    } finally {
      setBusy(false)
    }
  }

  function pick(f: File | undefined) {
    if (!f) return
    setFile(f)
    setSavedName('')
    void read(f, setup?.quality ?? 'standard')
  }

  if (!setup) return <Spinner />

  return (
    <div className="mx-auto max-w-2xl">
      {panel}
      <PageHeader title="Add from a photo" subtitle="We'll read the photo and fill in the form. You check it before it's saved." />
      <input ref={input} aria-label="Photo of the supply" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />

      {savedName && <div className="mb-4"><Notice tone="success">Saved “{savedName}”. Take another photo, or you're done.</Notice></div>}

      {!result && !busy && (
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 font-semibold">What are you photographing?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['package', 'A package with a label', 'Best results. We read the brand, size and count.'],
                  ['loose', 'A loose item, no label', "We'll guess the type, color and size. You'll check how much you have."],
                ] as const
              ).map(([k, title, help]) => (
                <label key={k} className={`flex min-h-16 cursor-pointer gap-3 rounded-2xl border-2 p-3 ${kind === k ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white'}`}>
                  <input type="radio" name="kind" className="mt-1 h-5 w-5 accent-brand-600" checked={kind === k} onChange={() => setKind(k)} />
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-stone-600">{help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button className="min-h-16 text-lg" onClick={() => guard(() => input.current?.click())}>
            📷 Take or choose a photo
          </Button>
          <p className="text-sm text-stone-600">Only a small copy of the photo is kept on this device. The larger copy is sent to Claude to read, then thrown away.</p>
        </div>
      )}

      {busy && <Spinner label="Reading your photo… this takes a few seconds." />}
      {error && (
        <div className="mt-4 flex flex-col gap-3">
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" onClick={() => guard(() => input.current?.click())}>
            Try another photo
          </Button>
        </div>
      )}

      {result && !busy && (
        <div className="flex flex-col gap-4">
          {!result.triedHarder && file && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
              <span className="text-stone-700">Details look wrong?</span>
              <Button variant="secondary" onClick={() => read(file, 'best')}>
                Try harder
              </Button>
            </div>
          )}
          <SupplyForm
            key={formKey}
            initial={result.draft}
            uncertain={result.uncertain}
            onSaved={async (s) => {
              if (s.upc && isValidUpc(s.upc)) {
                await cacheUpc(normalizeUpc(s.upc), s)
                void import('../lib/cloud/products').then((m) => m.contributeProduct(normalizeUpc(s.upc!), s))
              }
              setSavedName(s.name)
              setResult(null)
              setFile(null)
            }}
            onCancel={() => navigate('/add')}
          />
        </div>
      )}
    </div>
  )
}
