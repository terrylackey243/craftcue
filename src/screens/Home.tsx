import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { ButtonLink, Card } from '../components/ui'
import { STATUS_LABEL } from './Projects'
import { useAccount } from '../hooks'
import { cloudEnabled } from '../lib/cloud/config'
import { signupOpen } from '../lib/cloud/account'

const GOALS = [
  { goal: 'sell', icon: '💰', title: 'Something to sell', help: 'Craft fair, Etsy or a local shop' },
  { goal: 'decor', icon: '🏡', title: 'Decorate', help: 'A room, a season or a holiday' },
  { goal: 'gift', icon: '🎁', title: 'Make a gift', help: 'For someone special' },
] as const

export default function Home() {
  const supplyCount = useLiveQuery(() => db.supplies.count(), []) ?? 0
  const recent = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().filter((p) => p.status !== 'dismissed').limit(4).toArray(), []) ?? []

  const account = useAccount()

  return (
    <div className="flex flex-col gap-8">
      {cloudEnabled && !account.userId && (
        <div className="flex flex-col gap-3 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong>Your stash is only on this device.</strong> {signupOpen ? 'Create a free account' : 'Sign in'} so it's safe and shows up on all your devices.
          </p>
          <ButtonLink to="/settings#account">{signupOpen ? 'Create account' : 'Sign in'}</ButtonLink>
        </div>
      )}
      <section>
        <h1 className="mb-1 text-3xl font-bold">What would you like to make?</h1>
        <p className="mb-4 text-stone-600">We'll suggest projects using the supplies you already have.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {GOALS.map((g) => (
            <Link
              key={g.goal}
              to={`/suggest/${g.goal}`}
              className="flex min-h-28 items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-brand-100 transition hover:ring-brand-500 sm:flex-col sm:items-start"
            >
              <span aria-hidden className="text-4xl">
                {g.icon}
              </span>
              <span>
                <span className="block text-xl font-bold text-brand-800">{g.title}</span>
                <span className="block text-stone-600">{g.help}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Your stash</h2>
            <p className="text-stone-600">
              {supplyCount === 0
                ? 'Nothing added yet. Add a few supplies to get good suggestions.'
                : `${supplyCount} suppl${supplyCount === 1 ? 'y' : 'ies'} saved.`}
            </p>
          </div>
          <div className="flex gap-2">
            <ButtonLink to="/add">➕ Add supplies</ButtonLink>
            {supplyCount > 0 && (
              <ButtonLink to="/inventory" variant="secondary">
                See all
              </ButtonLink>
            )}
          </div>
        </Card>
      </section>

      {recent.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">Recent projects</h2>
            <Link to="/projects" className="font-semibold text-brand-700 underline">
              All projects
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {recent.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="block rounded-2xl bg-white p-4 ring-1 ring-stone-200 hover:ring-brand-500">
                  <span className="block font-semibold">{p.title}</span>
                  <span className="text-sm text-stone-600">{STATUS_LABEL[p.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
