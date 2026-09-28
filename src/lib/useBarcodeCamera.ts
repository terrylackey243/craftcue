import { useEffect, useRef, useState, type RefObject } from 'react'
import type { IScannerControls } from '@zxing/browser'

/**
 * Point the camera at a barcode (ZXing: works in Safari, unlike the native BarcodeDetector).
 * Calls onResult once with the digits, then stops the camera.
 */
export function useBarcodeCamera(videoRef: RefObject<HTMLVideoElement | null>, active: boolean, onResult: (code: string) => void): string {
  const [error, setError] = useState('')
  const callback = useRef(onResult)
  useEffect(() => {
    callback.current = onResult
  }, [onResult])

  useEffect(() => {
    if (!active) return
    let controls: IScannerControls | undefined
    let cancelled = false
    setError('')
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        if (!videoRef.current || cancelled) return
        controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current, (result) => {
          if (result && !cancelled) {
            cancelled = true
            controls?.stop()
            callback.current(result.getText())
          }
        })
        if (cancelled) controls.stop()
      } catch (e) {
        if (cancelled) return
        setError(
          (e as Error).name === 'NotAllowedError'
            ? 'Camera permission was turned off. Type the barcode number instead, or allow the camera in your browser settings.'
            : "The camera isn't available here. Type the barcode number instead.",
        )
      }
    })()
    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [active, videoRef])

  return error
}
