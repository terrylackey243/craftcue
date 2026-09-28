import { useState } from 'react'
import { Link } from 'react-router-dom'
import { saveSetup, setApiKey } from '../lib/repo'
import { Button, Field, Notice, Spinner, inputClass } from './ui'

/** Paste a key → we test it with the cheapest possible call → save only if it works. */
export default function KeyForm({ onSaved }: { onSaved?: () => void }) {
  const [key, setKey] = useState('')
  const [state, setState] = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ status: 'idle' })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const k = key.trim()
    const { looksLikeKey, testKey } = await import('../lib/ai/testKey')
    if (!looksLikeKey(k)) {
      setState({ status: 'error', message: 'That doesn’t look like an Anthropic key. It should start with sk-ant- and be quite long.' })
      return
    }
    setState({ status: 'testing' })
    const result = await testKey(k)
    if (!result.ok) {
      setState({ status: 'error', message: result.error.message })
      return
    }
    await setApiKey(k)
    await saveSetup({ aiEnabled: true })
    setKey('')
    setState({ status: 'ok', message: 'It works! Smart suggestions are turned on.' })
    onSaved?.()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <Field
        label="Paste your Anthropic API key"
        hint={
          <>
            Need one? <Link to="/help/ai-key" className="font-semibold text-brand-700 underline">Follow the step-by-step guide</Link>. Don't save your key on
            a shared or public computer.
          </>
        }
      >
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" disabled={!key.trim() || state.status === 'testing'}>
        Test and save key
      </Button>
      {state.status === 'testing' && <Spinner label="Checking your key with Anthropic…" />}
      {state.status === 'error' && <Notice tone="error">{state.message}</Notice>}
      {state.status === 'ok' && <Notice tone="success">{state.message}</Notice>}
    </form>
  )
}
