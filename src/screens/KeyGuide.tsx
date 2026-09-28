import { Link } from 'react-router-dom'
import KeyForm from '../components/KeyForm'
import { Notice, PageHeader } from '../components/ui'
import { CONSOLE_URL, COST_NOTE, KEY_GUIDE_STEPS } from '../data/keyGuide'

// Screenshots live in /docs/images so the README can use the same files (spec 7.2).
const shots = import.meta.glob<string>('../../docs/images/key-guide-*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' })
function shot(name: string): string | undefined {
  const hit = Object.entries(shots).find(([path]) => path.includes(`/key-guide-${name}.`))
  return hit?.[1]
}

export default function KeyGuide() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link to="/help" className="font-semibold text-brand-700 underline">
          ← Help
        </Link>
        <PageHeader title="Setting up smart suggestions" subtitle="About 10 minutes, one time only." />
      </div>

      <Notice tone="info">
        <p className="font-semibold">What this is</p>
        <p>
          CraftCue's smart features use Claude, an AI made by Anthropic. Instead of a subscription, you pay Anthropic directly for what you use, with a
          prepaid balance. {COST_NOTE}
        </p>
      </Notice>

      <ol className="flex flex-col gap-6">
        {KEY_GUIDE_STEPS.map((s, i) => {
          const img = shot(s.shot)
          return (
            <li key={s.shot} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <h2 className="text-xl font-bold">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-2 flex flex-col gap-2">
                {s.body.map((b) => (
                  <p key={b}>{b}</p>
                ))}
              </div>
              {s.link && (
                <a href={CONSOLE_URL + s.link} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-brand-700 underline">
                  Open the Anthropic Console ↗
                </a>
              )}
              {img ? (
                <img src={img} alt={s.alt} className="mt-3 w-full rounded-xl ring-1 ring-stone-200" loading="lazy" />
              ) : (
                <div className="mt-3 flex aspect-video items-center justify-center rounded-xl border-2 border-dashed border-stone-300 text-stone-500">Picture coming soon</div>
              )}
              {s.warn && (
                <div className="mt-3">
                  <Notice tone="warn">{s.warn}</Notice>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <div>
        <h2 className="mb-2 text-xl font-bold">Last step: paste your key here</h2>
        <KeyForm />
      </div>

      <Notice tone="warn">
        <p className="font-semibold">Keep your key private</p>
        <p>
          Anyone with your key can spend your credits. CraftCue only stores it on this device and only sends it to Anthropic. Don't save it on a shared or public
          computer. If you think someone has it, delete the key in the Console and make a new one.
        </p>
      </Notice>
    </div>
  )
}
