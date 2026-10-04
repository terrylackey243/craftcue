import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Suspense, useEffect } from 'react'
import { Spinner } from './ui'
import BackupReminder from './BackupReminder'
import { SyncBadge, SyncBanner } from './SyncStatus'
import { Toasts } from './Toast'

const NAV = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/inventory', label: 'My stash', icon: '🧵' },
  { to: '/projects', label: 'Projects', icon: '✂️' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2">
          <NavLink to="/" className="flex items-center gap-2 text-xl font-bold text-brand-700">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-9 w-9" />
            CraftCue
          </NavLink>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            <SyncBadge />
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `rounded-xl px-3 py-2 font-semibold ${isActive ? 'bg-brand-100 text-brand-800' : 'text-stone-700 hover:bg-stone-100'}`}
              >
                {n.label}
              </NavLink>
            ))}
            <NavLink to="/help" className={({ isActive }) => `rounded-xl px-3 py-2 font-semibold ${isActive ? 'bg-brand-100 text-brand-800' : 'text-stone-700 hover:bg-stone-100'}`}>
              Help
            </NavLink>
          </nav>
          <div className="flex items-center gap-1 md:hidden">
            <SyncBadge />
            <NavLink to="/help" className="rounded-xl px-3 py-2 font-semibold text-brand-700">
              Help
            </NavLink>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:pb-10">
        <SyncBanner />
        <BackupReminder />
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <Toasts />

      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-stone-600'}`}
              >
                <span aria-hidden className="text-xl">
                  {n.icon}
                </span>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
