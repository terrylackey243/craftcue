import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

// Big, plain components tuned for non-technical users: 48px+ touch targets, clear labels.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-stone-300 disabled:text-stone-500',
  secondary: 'bg-white text-brand-700 border-2 border-brand-200 hover:border-brand-500 disabled:text-stone-400 disabled:border-stone-200',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 disabled:text-stone-400',
  danger: 'bg-white text-red-700 border-2 border-red-200 hover:border-red-500',
}

const BASE = 'inline-flex items-center justify-center gap-2 rounded-xl px-5 min-h-12 font-semibold transition-colors disabled:cursor-not-allowed'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />
}

export function ButtonLink({ variant = 'primary', className = '', ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 ${className}`}>{children}</div>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-stone-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  highlight,
  id,
}: {
  label: string
  hint?: ReactNode
  children: (id: string) => ReactNode
  highlight?: string
  id?: string
}) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className={`flex flex-col gap-1 ${highlight ? 'rounded-xl bg-sun-300/40 p-2 ring-2 ring-sun-500' : ''}`}>
      <label htmlFor={fid} className="font-semibold text-stone-800">
        {label}
      </label>
      {children(fid)}
      {highlight && <p className="text-sm font-medium text-amber-900">⚠ {highlight}</p>}
      {hint && <p className="text-sm text-stone-600">{hint}</p>}
    </div>
  )
}

/** Shared field look without a width, for inputs that size themselves. */
export const fieldClass =
  'min-h-12 rounded-xl border-2 border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-500'
export const inputClass = `${fieldClass} w-full`

export function Chip({ selected, onClick, children }: { selected?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-11 rounded-full border-2 px-4 text-sm font-medium ${
        selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-800 hover:border-brand-500'
      }`}
    >
      {children}
    </button>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'warn' | 'bad' | 'good' | 'brand'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-stone-100 text-stone-700',
    warn: 'bg-amber-100 text-amber-900',
    bad: 'bg-red-100 text-red-800',
    good: 'bg-leaf-50 text-leaf-600',
    brand: 'bg-brand-100 text-brand-800',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${tones[tone]}`}>{children}</span>
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode }) {
  const tones = {
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-900 ring-red-200',
    success: 'bg-leaf-50 text-leaf-600 ring-green-200',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 ring-1 ${tones[tone]}`}>
      {children}
    </div>
  )
}

/** Accessible modal sheet (bottom sheet on phones, centered on larger screens). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])
  if (!open) return null
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-white p-0 backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="max-h-[85vh] overflow-y-auto p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full text-2xl text-stone-500 hover:bg-stone-100" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-300 p-8 text-center">
      <p className="text-lg font-semibold text-stone-800">{title}</p>
      {children && <div className="mt-3 text-stone-600">{children}</div>}
    </div>
  )
}

export function Spinner({ label = 'Working…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-stone-700">
      <span className="h-6 w-6 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function Stepper({ value, onChange, step = 1, label }: { value: number; onChange: (n: number) => void; step?: number; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(0, Math.round((value - step) * 1000) / 1000))} className="min-h-12 min-w-12 rounded-xl border-2 border-stone-300 bg-white text-2xl font-bold hover:border-brand-500">
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        className={`${fieldClass} w-24 text-center`}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'))
          onChange(Number.isFinite(n) && n >= 0 ? n : 0)
        }}
      />
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.round((value + step) * 1000) / 1000)} className="min-h-12 min-w-12 rounded-xl border-2 border-stone-300 bg-white text-2xl font-bold hover:border-brand-500">
        +
      </button>
    </div>
  )
}
