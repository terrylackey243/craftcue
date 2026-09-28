import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetupEditor } from '../hooks'
import { saveSetup } from '../lib/repo'
import { AboutYou, EquipmentPicker, MachinePicker, ToolsPicker } from '../components/SetupSections'
import KeyForm from '../components/KeyForm'
import { Button, Spinner } from '../components/ui'
import { getMachine, machineLabel } from '../data'

// First-run setup (spec 6). Every step after Welcome can be skipped; all of it is editable later.
const STEPS = ['welcome', 'machine', 'tools', 'equipment', 'about', 'ai', 'supplies'] as const
type Step = (typeof STEPS)[number]

export default function Wizard({ onComplete }: { onComplete?: () => void }) {
  const [setup, patch] = useSetupEditor()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')

  if (!setup) return <Spinner />
  const i = STEPS.indexOf(step)
  const next = () => setStep(STEPS[Math.min(i + 1, STEPS.length - 1)])
  const back = () => setStep(STEPS[Math.max(i - 1, 0)])
  const finish = async (to: string) => {
    await saveSetup({ setupComplete: true })
    // Tell the router directly; waiting for the database change to arrive could bounce us back here.
    onComplete?.()
    navigate(to, { replace: true })
  }
  const machine = getMachine(setup.machineId)

  const titles: Record<Step, string> = {
    welcome: 'Welcome to CraftCue',
    machine: 'Which cutting machine do you have?',
    tools: 'Which tools do you have for it?',
    equipment: 'What other equipment do you have?',
    about: 'A little about you',
    ai: 'Turn on smart suggestions (optional)',
    supplies: 'Add your first supplies',
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-6">
      {step !== 'welcome' && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-stone-600">
            Step {i} of {STEPS.length - 1}
          </p>
          <div className="mt-1 h-2 rounded-full bg-stone-200" aria-hidden>
            <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${(i / (STEPS.length - 1)) * 100}%` }} />
          </div>
        </div>
      )}

      <h1 className="mb-4 text-3xl font-bold">{titles[step]}</h1>

      <div className="flex-1">
        {step === 'welcome' && (
          <div className="flex flex-col items-center gap-6 py-6 text-center">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-28 w-28" />
            <p className="text-xl">Keep track of your craft supplies, and find out what you can make with what you already have.</p>
            <p className="rounded-2xl bg-leaf-50 px-4 py-3 text-lg font-semibold text-leaf-600">🔒 Your data stays on this device.</p>
            <p className="text-stone-600">Setup takes about two minutes. You can change any of it later in Settings.</p>
          </div>
        )}
        {step === 'machine' && <MachinePicker setup={setup} patch={patch} />}
        {step === 'tools' && (
          <>
            <p className="mb-4 text-stone-700">
              Tick the tools you own for your {machine ? machineLabel(machine) : 'machine'}. We'll only suggest projects you can make with them.
            </p>
            <ToolsPicker setup={setup} patch={patch} />
          </>
        )}
        {step === 'equipment' && <EquipmentPicker setup={setup} patch={patch} />}
        {step === 'about' && <AboutYou setup={setup} patch={patch} />}
        {step === 'ai' && (
          <div className="flex flex-col gap-4 text-lg">
            <p>
              CraftCue can suggest projects and recognise supplies from a photo. These smart features use <strong>Claude</strong>, an AI from Anthropic.
            </p>
            <p>
              To use them you need your own <strong>Anthropic API key</strong>. It costs a small amount each time you use it (a few cents), paid
              directly to Anthropic. Everything else in CraftCue is free and works without it.
            </p>
            <KeyForm onSaved={next} />
            <p className="text-base text-stone-600">
              Don't have a key? No problem. Tap <strong>Maybe later</strong> and you can set it up any time from Settings. There's a step-by-step
              guide there.
            </p>
          </div>
        )}
        {step === 'supplies' && (
          <div className="flex flex-col gap-4">
            <p className="text-lg">You're all set! The more of your stash you add, the better the suggestions get.</p>
            <Button className="min-h-16 text-lg" onClick={() => finish('/add')}>
              ➕ Add supplies now
            </Button>
            <Button variant="secondary" onClick={() => finish('/')}>
              I'll do it later
            </Button>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        {i > 0 ? (
          <Button variant="ghost" onClick={back}>
            ← Back
          </Button>
        ) : (
          <span />
        )}
        {step === 'welcome' && (
          <Button className="min-h-14 px-8 text-lg" onClick={next}>
            Let's start
          </Button>
        )}
        {step !== 'welcome' && step !== 'supplies' && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={next}>
              {step === 'ai' ? 'Maybe later' : 'Skip'}
            </Button>
            {step !== 'ai' && <Button onClick={next}>Next →</Button>}
          </div>
        )}
      </div>
    </div>
  )
}
