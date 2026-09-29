import { useRef, useState } from 'react'
import { useBarcodeCamera } from '../lib/useBarcodeCamera'
import { isValidUpc, normalizeUpc } from '../lib/upc'
import { Button, Field, Notice, Sheet, inputClass } from './ui'

/** Barcode box with a "Scan" button that opens the camera. Warns about a mistyped number. */
export default function BarcodeField({ value, onChange, label = 'Barcode (UPC)', hint }: { value: string; onChange: (upc: string) => void; label?: string; hint?: string }) {
  const [scanning, setScanning] = useState(false)
  const digits = value.replace(/\D/g, '')
  const looksWrong = digits.length >= 8 && !isValidUpc(digits)

  return (
    <>
      <Field label={label} hint={hint} highlight={looksWrong ? "That number doesn't look right. Check the digits under the bars." : undefined}>
        {(id) => (
          <div className="flex gap-2">
            <input id={id} inputMode="numeric" className={inputClass} placeholder="The numbers under the barcode" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, ''))} />
            <Button variant="secondary" onClick={() => setScanning(true)} aria-label={`Scan ${label}`}>
              📷 Scan
            </Button>
          </div>
        )}
      </Field>
      <Sheet open={scanning} onClose={() => setScanning(false)} title="Scan the barcode">
        {scanning && (
          <ScannerView
            onResult={(code) => {
              onChange(normalizeUpc(code))
              setScanning(false)
            }}
          />
        )}
      </Sheet>
    </>
  )
}

export function ScannerView({ onResult }: { onResult: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const error = useBarcodeCamera(video, true, onResult)
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Notice tone="warn">{error}</Notice>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Camera view" />
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-xl border-4 border-white/80" />
          </div>
          <p className="text-center text-stone-700">Hold the barcode inside the box. It scans by itself.</p>
        </>
      )}
    </div>
  )
}
