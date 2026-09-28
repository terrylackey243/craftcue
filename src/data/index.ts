import type { MachineProfile, ToolDefinition, UserSetup } from '../types'
import toolsJson from './tools.json'

// Machine profiles are one JSON file each so contributors can add a machine without touching code.
const machineModules = import.meta.glob<{ default: MachineProfile }>('./machines/*.json', { eager: true })

const ORDER = ['cricut-maker-5', 'cricut-maker-4', 'cricut-maker-3', 'cricut-explore-5', 'cricut-explore-4', 'cricut-explore-3', 'cricut-joy-xtra', 'cricut-joy']

export const MACHINES: MachineProfile[] = Object.values(machineModules)
  .map((m) => m.default)
  .sort((a, b) => {
    // Known Cricut order first, then other brands alphabetically, the generic profile last.
    if (a.userDefined !== b.userDefined) return a.userDefined ? 1 : -1
    const ia = ORDER.indexOf(a.id)
    const ib = ORDER.indexOf(b.id)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`)
  })

export const TOOLS: ToolDefinition[] = toolsJson

const toolById = new Map(TOOLS.map((t) => [t.id, t]))
const machineById = new Map(MACHINES.map((m) => [m.id, m]))

export function getTool(id: string): ToolDefinition | undefined {
  return toolById.get(id)
}

export function getMachine(id: string | undefined): MachineProfile | undefined {
  return id ? machineById.get(id) : undefined
}

/** The machine profile with any user overrides (generic width/thickness, Cameo 5 Plus width) applied. */
export function effectiveMachine(setup: Pick<UserSetup, 'machineId' | 'customMachine'>): MachineProfile | undefined {
  const base = getMachine(setup.machineId)
  if (!base) return undefined
  if (!setup.customMachine) return base
  return {
    ...base,
    name: base.userDefined && setup.customMachine.name ? setup.customMachine.name : base.name,
    cutWidthIn: setup.customMachine.cutWidthIn || base.cutWidthIn,
    maxMaterialThicknessMm: setup.customMachine.maxMaterialThicknessMm || base.maxMaterialThicknessMm,
  }
}

export function machineLabel(m: MachineProfile): string {
  return m.userDefined ? m.name : `${m.brand} ${m.name}`
}
