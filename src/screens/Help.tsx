import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui'

const TOPICS: { q: string; a: ReactNode }[] = [
  {
    q: 'What does CraftCue do?',
    a: (
      <>
        <p>It keeps a list of your craft supplies (your "stash"), the tools you have for your cutting machine, and your other equipment. Then it suggests projects you can make with what you already have: to sell, to decorate, or as a gift.</p>
        <p>CraftCue doesn't make cut files. When you like an idea, you design it in Cricut Design Space (or your machine's software) using the design tips we give you.</p>
      </>
    ),
  },
  {
    q: 'Getting started',
    a: (
      <ol className="list-decimal space-y-1 pl-6">
        <li>
          Add your supplies from <Link to="/add" className="font-semibold text-brand-700 underline">Add supplies</Link>. Scanning barcodes is fastest, and "Add a whole shelf" can add lots at once.
        </li>
        <li>
          Set up smart suggestions (optional): <Link to="/help/ai-key" className="font-semibold text-brand-700 underline">step-by-step guide</Link>.
        </li>
        <li>On Home, pick Something to sell, Decorate or Make a gift, answer a couple of questions, and get ideas.</li>
        <li>Save the ones you like. When you make one, tap "Mark as made" and CraftCue takes the supplies out of your stash.</li>
      </ol>
    ),
  },
  {
    q: 'Is my information private?',
    a: (
      <>
        <p>Yes. Everything is saved only in this browser on this device. There are no accounts, no tracking and no ads.</p>
        <p>The only time anything leaves your device is when you use a smart feature: then your request (your supply list, and the photo if you took one) goes straight to Anthropic to get an answer. Anthropic's commercial terms say they don't train their AI on API data.</p>
      </>
    ),
  },
  {
    q: 'Keeping your stash safe (backups)',
    a: (
      <>
        <p>
          Because your data lives in the browser, it can be lost if you clear your browser's data, and phones and tablets sometimes clear it when space is low. Go to{' '}
          <Link to="/settings" className="font-semibold text-brand-700 underline">Settings → Backup & restore</Link> and tap "Save a backup" now and then. CraftCue will remind you.
        </p>
        <p>To move to a new device, save a backup on the old one, open CraftCue on the new one, and choose "Restore from a backup".</p>
      </>
    ),
  },
  {
    q: 'Put CraftCue on your Home Screen',
    a: (
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <strong>iPhone / iPad (Safari):</strong> tap the Share button (square with an arrow), then "Add to Home Screen". This also helps protect your saved data.
        </li>
        <li>
          <strong>Android (Chrome):</strong> tap the ⋮ menu, then "Add to Home screen" or "Install app".
        </li>
        <li>
          <strong>Computer (Chrome or Edge):</strong> click the install icon at the right end of the address bar.
        </li>
      </ul>
    ),
  },
  {
    q: 'Does it work without internet?',
    a: <p>Yes. Once it has been opened once, your stash, projects, shopping list and backups all work offline. Smart suggestions and photo reading need internet.</p>,
  },
  {
    q: 'What does the AI cost?',
    a: (
      <p>
        You pay Anthropic directly for what you use, usually a few cents per round of ideas. Settings shows an estimate of this month's use. See the{' '}
        <Link to="/help/ai-key" className="font-semibold text-brand-700 underline">key guide</Link> for details.
      </p>
    ),
  },
  {
    q: 'Barcode scanning tips',
    a: (
      <ul className="list-disc space-y-1 pl-6">
        <li>Allow the camera when your browser asks.</li>
        <li>Hold the barcode flat inside the box, about a hand's length away, in good light.</li>
        <li>If the camera won't work, type the numbers printed under the barcode.</li>
        <li>The first time you scan a product, take a photo of the package. After that, the same barcode fills in by itself.</li>
      </ul>
    ),
  },
  {
    q: 'A suggestion needs something I don\'t have',
    a: <p>Ideas are split into "Make it now" (you have everything) and "Needs one more thing". Saved projects put missing items on your Shopping list. Tick "Only use what I have" to get ideas that need no shopping.</p>,
  },
]

export default function Help() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Help" />
      <div className="flex flex-col gap-3">
        {TOPICS.map((t, i) => (
          <details key={t.q} className="group rounded-2xl bg-white ring-1 ring-stone-200" open={i === 0}>
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between p-4 text-lg font-bold">
              {t.q}
              <span aria-hidden className="text-2xl text-stone-400 transition group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-2 border-t border-stone-100 p-4">{t.a}</div>
          </details>
        ))}
      </div>
      <p className="mt-6 text-sm text-stone-600">
        CraftCue is not affiliated with or endorsed by Cricut, Silhouette, Brother or Anthropic. Brand names are used only to describe compatibility.
      </p>
    </div>
  )
}
