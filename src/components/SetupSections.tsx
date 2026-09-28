import { useState } from 'react'
import { MACHINES, getMachine, getTool, machineLabel } from '../data'
import { EQUIPMENT, type SkillLevel, type UserSetup } from '../types'
import { Badge, Chip, Field, inputClass } from './ui'

type Patch = (p: Partial<UserSetup>) => void

// Generic machine glyph — the spec forbids manufacturer product photos or logos.
function CutterIcon() {
  return (
    <svg viewBox="0 0 48 32" className="h-8 w-12 shrink-0" aria-hidden>
      <rect x="2" y="8" width="44" height="18" rx="5" fill="#fbe4ed" stroke="#b4436c" strokeWidth="2" />
      <rect x="8" y="4" width="32" height="6" rx="3" fill="#f4c95d" />
      <path d="M22 14v7l2 3 2-3v-7z" fill="#b4436c" />
    </svg>
  )
}

export function MachinePicker({ setup, patch }: { setup: UserSetup; patch: Patch }) {
  const selected = getMachine(setup.machineId)

  function choose(id: string) {
    const m = getMachine(id)
    if (!m) return
    // Keep tools that still fit the new machine, and add its default tools.
    const kept = setup.ownedToolIds.filter((t) => m.compatibleTools.includes(t))
    const ownedToolIds = Array.from(new Set([...m.defaultTools, ...kept]))
    patch({
      machineId: id,
      ownedToolIds,
      customMachine: m.userDefined ? setup.customMachine ?? { cutWidthIn: m.cutWidthIn, maxMaterialThicknessMm: m.maxMaterialThicknessMm } : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Your cutting machine" className="grid gap-2 sm:grid-cols-2">
        {MACHINES.map((m) => {
          const on = m.id === setup.machineId
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(m.id)}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 p-3 text-left ${on ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white hover:border-brand-500'}`}
            >
              <CutterIcon />
              <span className="flex flex-col">
                <span className="font-semibold">{machineLabel(m)}</span>
                <span className="text-sm text-stone-600">
                  {m.userDefined ? 'You enter the size limits' : `Up to ${m.cutWidthIn} in wide · ${m.maxMaterialThicknessMm} mm thick`}
                </span>
                {!m.verified && (
                  <span className="mt-1">
                    <Badge tone="warn">Details not double-checked yet</Badge>
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {selected?.userDefined && (
        <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200 sm:grid-cols-3">
          <Field label="Machine name (optional)">
            {(id) => (
              <input
                id={id}
                className={inputClass}
                value={setup.customMachine?.name ?? ''}
                placeholder="e.g. my vinyl cutter"
                onChange={(e) => patch({ customMachine: { ...defaults(setup), name: e.target.value } })}
              />
            )}
          </Field>
          <Field label="Widest it cuts (inches)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className={inputClass}
                value={setup.customMachine?.cutWidthIn ?? ''}
                onChange={(e) => patch({ customMachine: { ...defaults(setup), cutWidthIn: Number(e.target.value) || 0 } })}
              />
            )}
          </Field>
          <Field label="Thickest material (mm)">
            {(id) => (
              <input
                id={id}
                inputMode="decimal"
                className={inputClass}
                value={setup.customMachine?.maxMaterialThicknessMm ?? ''}
                onChange={(e) => patch({ customMachine: { ...defaults(setup), maxMaterialThicknessMm: Number(e.target.value) || 0 } })}
              />
            )}
          </Field>
        </div>
      )}

      {selected?.id === 'silhouette-cameo-5' && (
        <label className="flex min-h-12 items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-stone-200">
          <input
            type="checkbox"
            className="h-6 w-6 accent-brand-600"
            checked={setup.customMachine?.cutWidthIn === 15}
            onChange={(e) => patch({ customMachine: e.target.checked ? { cutWidthIn: 15, maxMaterialThicknessMm: selected.maxMaterialThicknessMm } : undefined })}
          />
          I have the Plus model (cuts up to 15 in wide)
        </label>
      )}

      {selected && selected.notes.length > 0 && !selected.userDefined && (
        <ul className="list-disc space-y-1 pl-6 text-stone-700">
          {selected.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function defaults(setup: UserSetup) {
  const m = getMachine(setup.machineId)
  return setup.customMachine ?? { cutWidthIn: m?.cutWidthIn ?? 12, maxMaterialThicknessMm: m?.maxMaterialThicknessMm ?? 2 }
}

export function ToolsPicker({ setup, patch }: { setup: UserSetup; patch: Patch }) {
  const machine = getMachine(setup.machineId)
  if (!machine) return null
  const toggle = (id: string) =>
    patch({ ownedToolIds: setup.ownedToolIds.includes(id) ? setup.ownedToolIds.filter((t) => t !== id) : [...setup.ownedToolIds, id] })

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {machine.compatibleTools.map((id) => {
        const tool = getTool(id)
        if (!tool) return null
        const on = setup.ownedToolIds.includes(id)
        return (
          <li key={id}>
            <label className={`flex min-h-16 cursor-pointer gap-3 rounded-2xl border-2 p-3 ${on ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white'}`}>
              <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-brand-600" checked={on} onChange={() => toggle(id)} />
              <span>
                <span className="block font-semibold">{tool.name}</span>
                <span className="block text-sm text-stone-600">{tool.plainDescription}</span>
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

export function EquipmentPicker({ setup, patch }: { setup: UserSetup; patch: Patch }) {
  const toggle = (id: string) =>
    patch({ equipment: setup.equipment.includes(id) ? setup.equipment.filter((t) => t !== id) : [...setup.equipment, id] })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {EQUIPMENT.map((e) => (
          <Chip key={e.id} selected={setup.equipment.includes(e.id)} onClick={() => toggle(e.id)}>
            {e.name}
          </Chip>
        ))}
      </div>
      <Field label="Anything else?" hint="For example: Cricut EasyPress 3, sublimation printer, embroidery machine.">
        {(id) => <input id={id} className={inputClass} value={setup.equipmentOther} onChange={(e) => patch({ equipmentOther: e.target.value })} />}
      </Field>
    </div>
  )
}

const SKILLS: { id: SkillLevel; label: string; help: string }[] = [
  { id: 'beginner', label: 'Just starting', help: 'Keep it simple, explain the steps.' },
  { id: 'comfortable', label: 'Comfortable', help: "I've made a bunch of projects." },
  { id: 'experienced', label: 'Experienced', help: 'Challenge me.' },
]

const INTEREST_IDEAS = ['home decor', 'shirts', 'cards', 'stickers', 'kids', 'holidays', 'weddings', 'sports', 'pets', 'teachers', 'farmhouse', 'faith', 'gardening', 'coffee']

export function AboutYou({ setup, patch }: { setup: UserSetup; patch: Patch }) {
  const [draft, setDraft] = useState('')
  const add = (tag: string) => {
    const t = tag.trim().toLowerCase()
    if (t && !setup.interests.includes(t)) patch({ interests: [...setup.interests, t] })
  }
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-2 font-semibold">How much crafting experience do you have?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SKILLS.map((s) => (
            <label key={s.id} className={`flex min-h-16 cursor-pointer gap-3 rounded-2xl border-2 p-3 ${setup.skillLevel === s.id ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white'}`}>
              <input type="radio" name="skill" className="mt-1 h-5 w-5 accent-brand-600" checked={setup.skillLevel === s.id} onChange={() => patch({ skillLevel: s.id })} />
              <span>
                <span className="block font-semibold">{s.label}</span>
                <span className="block text-sm text-stone-600">{s.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="mb-2 font-semibold">What do you like to make? (optional)</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {INTEREST_IDEAS.map((t) => (
            <Chip key={t} selected={setup.interests.includes(t)} onClick={() => (setup.interests.includes(t) ? patch({ interests: setup.interests.filter((x) => x !== t) }) : add(t))}>
              {t}
            </Chip>
          ))}
          {setup.interests
            .filter((t) => !INTEREST_IDEAS.includes(t))
            .map((t) => (
              <Chip key={t} selected onClick={() => patch({ interests: setup.interests.filter((x) => x !== t) })}>
                {t} ×
              </Chip>
            ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add(draft)
            setDraft('')
          }}
        >
          <label className="sr-only" htmlFor="interest-add">
            Add your own interest
          </label>
          <input id="interest-add" className={inputClass} placeholder="Add your own…" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="min-h-12 rounded-xl bg-brand-600 px-4 font-semibold text-white">
            Add
          </button>
        </form>
      </div>
    </div>
  )
}
