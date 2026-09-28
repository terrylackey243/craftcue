import { useState } from 'react'
import { useApiKey } from '../hooks'
import AiSetupPanel from './AiSetupPanel'

/**
 * Wrap an AI action: runs it if a key is saved, otherwise opens the friendly setup panel and runs
 * it once setup finishes (spec 7.1).
 */
export function useAiGate() {
  const key = useApiKey()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)

  const guard = (action: () => void) => {
    if (key) action()
    else {
      setPending(() => action)
      setOpen(true)
    }
  }

  const panel = (
    <AiSetupPanel
      open={open}
      onClose={() => setOpen(false)}
      onReady={() => {
        // The key is saved now; run what the user originally asked for.
        setTimeout(() => pending?.(), 0)
        setPending(null)
      }}
    />
  )

  return { hasKey: Boolean(key), guard, panel }
}
