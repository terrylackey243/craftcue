import { Link } from 'react-router-dom'
import KeyForm from './KeyForm'
import { Sheet } from './ui'

/** What every AI button opens when no key is saved (spec 7.1): never a dead button or an error. */
export default function AiSetupPanel({ open, onClose, onReady }: { open: boolean; onClose: () => void; onReady?: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Smart suggestions need a quick one-time setup">
      <div className="flex flex-col gap-4">
        <p>
          Suggestions and photo recognition use <strong>Claude</strong>, an AI from Anthropic. You bring your own key, so it's paid directly to Anthropic,
          usually a few cents each time.
        </p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>Make a free Anthropic Console account</li>
          <li>Add a little credit (and set a monthly limit)</li>
          <li>Create a key and paste it below</li>
        </ol>
        <Link to="/help/ai-key" onClick={onClose} className="font-semibold text-brand-700 underline">
          Show me how, step by step (with pictures) →
        </Link>
        <KeyForm
          onSaved={() => {
            onReady?.()
            onClose()
          }}
        />
        <p className="text-sm text-stone-600">Everything else in CraftCue works without a key: your stash, projects, shopping list and backups.</p>
      </div>
    </Sheet>
  )
}
