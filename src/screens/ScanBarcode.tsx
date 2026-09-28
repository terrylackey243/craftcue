import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBarcodeCamera } from '../lib/useBarcodeCamera'
import { useCategories, useSetup } from '../hooks'
import { cacheUpc } from '../lib/repo'
import { isValidUpc, lookupUpc, normalizeUpc } from '../lib/upc'
import { makeThumbnail, makeVisionImage } from '../lib/images'
import { readSinglePhoto } from '../lib/ai/vision'
import { friendlyError } from '../lib/ai/aiClient'
import SupplyForm, { emptyDraft, type SupplyDraft } from '../components/SupplyForm'
import AssortmentForm, { type AssortmentInitial } from '../components/AssortmentForm'
import { addAnotherPack } from '../lib/assortment'
import { db } from '../db'
import { totalCount } from '../lib/assortment'
import { useAiGate } from '../components/useAiGate'
import { Button, Notice, PageHeader, Spinner, inputClass } from '../components/ui'
import type { Supply } from '../types'

type Phase =
  | { k: 'scan' }
  | { k: 'looking'; upc: string }
  | { k: 'miss'; upc: string }
  | { k: 'reading'; upc: string }
  | { k: 'form'; upc: string; draft: SupplyDraft; uncertain: Partial<Record<keyof Supply, string>>; from: string }
  | { k: 'saved'; name: string }
  | { k: 'mixed'; upc: string; initial: AssortmentInitial; from: string }
  | { k: 'another'; upc: string; existing: Supply[]; initial: AssortmentInitial }

export default function ScanBarcode() {
  const navigate = useNavigate()
  const setup = useSetup()
  const categories = useCategories()
  const { guard, panel } = useAiGate()
  const [phase, setPhase] = useState<Phase>({ k: 'scan' })
  const [manual, setManual] = useState('')
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  async function found(raw: string) {
    const upc = normalizeUpc(raw)
    setPhase({ k: 'looking', upc })
    const hit = await lookupUpc(upc, { onlineEnabled: !!setup?.upcLookupEnabled })
    const colors = (hit?.supply as { colors?: { color: string; count: number }[] } | undefined)?.colors
    if (hit && colors?.length) {
      // A mixed-color pack. Already have it? Offer to add another pack to each color.
      const initial: AssortmentInitial = { ...(hit.supply as AssortmentInitial), colors, upc }
      const existing = await db.supplies.where('upc').equals(upc).toArray()
      if (existing.length) setPhase({ k: 'another', upc, existing, initial })
      else setPhase({ k: 'mixed', upc, initial, from: hit.from === 'cache' ? "Found it — you've scanned this pack before." : 'Found this pack. Please check the colors.' })
      return
    }
    if (hit) {
      const unconfirmed = hit.from === 'shared' && hit.status !== 'confirmed'
      const from =
        hit.from === 'cache'
          ? "Found it — you've scanned this before."
          : hit.from === 'shared'
            ? unconfirmed
              ? 'Another crafter added this one. Please check the details.'
              : `Found it — confirmed by ${hit.supporters} crafters.`
            : 'Found it in our list of common products.'
      const check = unconfirmed ? 'Added by another crafter — please check' : undefined
      setPhase({
        k: 'form',
        upc,
        from,
        draft: { ...emptyDraft(), ...hit.supply, upc, quantity: 1, source: 'barcode' } as SupplyDraft,
        uncertain: { quantity: 'How many of these do you have?', ...(check ? { name: check, category: check, dimensions: check } : {}) },
      })
    } else {
      setPhase({ k: 'miss', upc })
    }
  }

  // Camera scanning (shared with the Scan buttons on the supply forms).
  const scanError = useBarcodeCamera(videoRef, phase.k === 'scan', (code) => void found(code))
  const cameraShownError = scanError

  async function readPackage(file: File | undefined, upc: string) {
    if (!file || !setup) return
    setPhase({ k: 'reading', upc })
    setError('')
    try {
      const [img, thumb] = await Promise.all([makeVisionImage(file), makeThumbnail(file)])
      const r = await readSinglePhoto('package', img, categories, setup.quality, upc)
      setPhase({ k: 'form', upc, from: 'We read the package. Please check the details.', draft: { ...emptyDraft(), ...r.supply, upc, thumbnail: thumb.dataUrl, source: 'barcode' } as SupplyDraft, uncertain: r.uncertain })
    } catch (e) {
      setError(friendlyError(e).message)
      setPhase({ k: 'miss', upc })
    }
  }

  if (!setup) return <Spinner />

  return (
    <div className="mx-auto max-w-2xl">
      {panel}
      <PageHeader title="Scan a barcode" />

      {phase.k === 'scan' && (
        <div className="flex flex-col gap-4">
          {!cameraShownError && (
            <div className="relative overflow-hidden rounded-3xl bg-black">
              <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Camera view" />
              <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-4 border-white/80" />
            </div>
          )}
          {!cameraShownError && <p className="text-center text-stone-700">Hold the barcode inside the box. It scans by itself.</p>}
          {cameraShownError && <Notice tone="warn">{cameraShownError}</Notice>}
          <form
            className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200"
            onSubmit={(e) => {
              e.preventDefault()
              const digits = manual.replace(/\D/g, '')
              if (!isValidUpc(digits)) {
                setError('That number doesn’t look like a complete barcode. Check the digits under the bars (usually 12 or 13).')
                return
              }
              setError('')
              void found(digits)
            }}
          >
            <label htmlFor="upc-manual" className="font-semibold">
              Or type the numbers under the barcode
            </label>
            <div className="flex gap-2">
              <input id="upc-manual" inputMode="numeric" className={inputClass} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 093573123456" />
              <Button type="submit">Look up</Button>
            </div>
          </form>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}

      {phase.k === 'looking' && <Spinner label="Looking it up…" />}

      {phase.k === 'miss' && (
        <div className="flex flex-col gap-4">
          <Notice tone="info">
            We don't know barcode <strong>{phase.upc}</strong> yet. Take a quick photo of the front of the package and we'll fill in the details. Next time you
            scan it, it'll be instant.
          </Notice>
          {error && <Notice tone="error">{error}</Notice>}
          <input ref={photoRef} aria-label="Photo of the package" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => readPackage(e.target.files?.[0], phase.upc)} />
          <Button className="min-h-14 text-lg" onClick={() => guard(() => photoRef.current?.click())}>
            📷 Take a photo of the package
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setPhase({ k: 'form', upc: phase.upc, from: '', draft: { ...emptyDraft(), upc: phase.upc, source: 'barcode' }, uncertain: {} })
            }
          >
            Type the details instead
          </Button>
          <Button variant="secondary" onClick={() => setPhase({ k: 'mixed', upc: phase.upc, initial: { upc: phase.upc }, from: '' })}>
            It's a pack with several colors
          </Button>
          <Button variant="ghost" onClick={() => setPhase({ k: 'scan' })}>
            Scan a different one
          </Button>
        </div>
      )}

      {phase.k === 'reading' && <Spinner label="Reading the package…" />}

      {phase.k === 'form' && (
        <div className="flex flex-col gap-4">
          {phase.from && <Notice tone="success">{phase.from}</Notice>}
          <SupplyForm
            initial={phase.draft}
            uncertain={phase.uncertain}
            onSaved={async (s) => {
              // Remember this barcode so the next scan needs no network call (spec Phase 3).
              await cacheUpc(phase.upc, s)
              // Share the product description so the next crafter's scan fills in instantly.
              void import('../lib/cloud/products').then((m) => m.contributeProduct(phase.upc, s))
              setPhase({ k: 'saved', name: s.name })
            }}
            onCancel={() => setPhase({ k: 'scan' })}
          />
        </div>
      )}

      {phase.k === 'mixed' && (
        <div className="flex flex-col gap-4">
          {phase.from && <Notice tone="success">{phase.from}</Notice>}
          <AssortmentForm initial={phase.initial} onSaved={(saved) => setPhase({ k: 'saved', name: `${saved[0]?.setName ?? 'Pack'} (${saved.length} colors)` })} onCancel={() => setPhase({ k: 'scan' })} />
        </div>
      )}

      {phase.k === 'another' && (
        <div className="flex flex-col gap-4">
          <Notice tone="success">
            You already have this pack: <strong>{phase.existing[0].setName ?? phase.existing[0].name}</strong> ({phase.existing.length} colors).
          </Notice>
          <Button
            className="min-h-14 text-lg"
            onClick={async () => {
              await addAnotherPack(phase.existing, phase.initial.colors ?? [])
              setPhase({ k: 'saved', name: `another pack of ${phase.existing[0].setName ?? phase.existing[0].name}` })
            }}
          >
            ➕ Add another pack (+{totalCount(phase.initial.colors ?? [])} across {phase.initial.colors?.length} colors)
          </Button>
          <Button variant="secondary" onClick={() => setPhase({ k: 'mixed', upc: phase.upc, initial: phase.initial, from: '' })}>
            Enter it as a separate pack
          </Button>
        </div>
      )}

      {phase.k === 'saved' && (
        <div className="flex flex-col gap-4">
          <Notice tone="success">Saved “{phase.name}”.</Notice>
          <Button className="min-h-14 text-lg" onClick={() => setPhase({ k: 'scan' })}>
            Scan another
          </Button>
          <Button variant="secondary" onClick={() => navigate('/inventory')}>
            I'm done
          </Button>
        </div>
      )}
    </div>
  )
}
