import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui'

const WAYS = [
  { to: '/add/scan', icon: '📷', title: 'Scan barcode', help: 'Point your camera at the barcode on the package. Fastest for store-bought supplies.' },
  { to: '/add/photo', icon: '🖼️', title: 'Take a photo', help: 'Snap the package or the item and we fill in the details. (Smart feature)' },
  { to: '/add/manual', icon: '✏️', title: 'Type it in', help: 'Pick the type and fill in a short form. Works for anything.' },
  { to: '/add/bulk', icon: '🧺', title: 'Add a whole shelf', help: 'One photo of a shelf or bin, and we list everything we can see. (Smart feature)' },
]

export default function AddSupply() {
  return (
    <div>
      <PageHeader title="Add supplies" subtitle="Choose whichever is easiest. You'll always get to check the details before saving." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {WAYS.map((w) => (
          <li key={w.to}>
            <Link to={w.to} className="flex min-h-28 items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-brand-100 hover:ring-brand-500">
              <span aria-hidden className="text-4xl">
                {w.icon}
              </span>
              <span>
                <span className="block text-xl font-bold text-brand-800">{w.title}</span>
                <span className="block text-stone-600">{w.help}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
