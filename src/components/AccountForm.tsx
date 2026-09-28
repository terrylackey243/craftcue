import { useState } from 'react'
import { authMethod, sendCode, signInWithPassword, signUpWithPassword, signupOpen, verifyCode } from '../lib/cloud/account'
import { Button, Field, Notice, Spinner, inputClass } from './ui'

/**
 * Sign up or sign in. Password or 6-digit email code depending on the build; "create account"
 * only when sign-ups are open on this server.
 */
export default function AccountForm({ onDone, startWith }: { onDone: () => void; startWith?: 'create' | 'signin' }) {
  const [mode, setMode] = useState<'create' | 'signin'>(signupOpen ? (startWith ?? 'create') : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(fn: () => Promise<string | null>) {
    setBusy(true)
    setError('')
    try {
      const err = await fn()
      if (err) setError(err)
      else return true
    } catch {
      setError("Couldn't reach CraftCue. Check your internet connection.")
    } finally {
      setBusy(false)
    }
    return false
  }

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!emailOk) return setError('Please enter your email address.')
    if (authMethod === 'otp') {
      if (!codeSent) {
        if (await run(() => sendCode(email))) setCodeSent(true)
      } else if (await run(() => verifyCode(email, code))) onDone()
      return
    }
    if (password.length < 8) return setError('Your password needs at least 8 characters.')
    if (await run(() => (mode === 'create' ? signUpWithPassword(email, password) : signInWithPassword(email, password)))) onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <Field label="Email address">
        {(id) => <input id={id} type="email" autoComplete="email" inputMode="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} disabled={codeSent} />}
      </Field>

      {authMethod === 'password' && (
        <Field label={mode === 'create' ? 'Choose a password' : 'Password'} hint={mode === 'create' ? 'At least 8 characters.' : undefined}>
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
      )}

      {authMethod === 'otp' && codeSent && (
        <Field label="The 6-digit code we emailed you" hint="It can take a minute to arrive. Check your spam folder too.">
          {(id) => <input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={8} className={`${inputClass} text-center text-2xl tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} />}
        </Field>
      )}

      <Button type="submit" disabled={busy} className="min-h-14 text-lg">
        {authMethod === 'otp' ? (codeSent ? 'Continue' : 'Email me a code') : mode === 'create' ? 'Create my free account' : 'Sign in'}
      </Button>
      {busy && <Spinner label={mode === 'create' ? 'Creating your account…' : 'Signing in…'} />}
      {error && <Notice tone="error">{error}</Notice>}

      {authMethod === 'password' && signupOpen && (
        <button type="button" className="self-center font-semibold text-brand-700 underline" onClick={() => setMode(mode === 'create' ? 'signin' : 'create')}>
          {mode === 'create' ? 'I already have an account' : 'Create a new account instead'}
        </button>
      )}
      {authMethod === 'otp' && codeSent && (
        <button type="button" className="self-center font-semibold text-brand-700 underline" onClick={() => setCodeSent(false)}>
          Use a different email
        </button>
      )}
    </form>
  )
}
