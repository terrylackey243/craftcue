// Builds what the recommendation model sees (spec 9.2 / 9.4). Pure functions — unit tested.
import { LARGE_INVENTORY } from '../../config'
import { effectiveMachine, getTool, machineLabel } from '../../data'
import { formatMoney } from '../money'
import { EQUIPMENT, type Category, type GoalRequest, type Person, type Supply, type UserSetup } from '../../types'

export const SYSTEM_RULES = `You are CraftCue, a friendly helper for people who make things with a home cutting machine (like a Cricut). You suggest projects the crafter can make using the supplies, tools and equipment they already own.

Rules you must always follow:
1. In "uses", only reference supplyId values that appear in the INVENTORY list, copied exactly. Anything else the project needs goes in "missing" with a short reason and a rough cost in US dollars.
2. Amounts in "uses" are for ONE finished item, in the same unit as the inventory line (e.g. if the inventory says "3 sheet", use sheets; for a roll, use a fraction of a roll). Keep amounts realistic. Only list things that get used up: never list cutting mats, machine tools or other reusable items in "uses".
3. Never require a machine tool the crafter doesn't own, and never exceed the machine's cut width or maximum material thickness. If a great idea needs something they lack, you may still include it, but put the missing tool or material in "missing" and say so.
4. "toolsNeeded" lists machine tool ids (from TOOLS). "equipmentNeeded" lists equipment ids (from EQUIPMENT). Everyday hand items (scissors, weeding hook, scraper, ruler, iron) belong in the steps, not in these lists — unless the crafter's machine or project truly needs them and they are in the EQUIPMENT list.
5. If the request says ONLY USE WHAT I HAVE, "missing" must be empty for every suggestion. Choose ideas that need nothing extra.
6. Write in plain, warm, everyday language suited to the crafter's skill level. No jargon without a short explanation. Steps are short and numbered by order (no numbers in the text itself).
7. "designTips" suggests search terms and operations to use in the design software (cut, draw, score, engrave, deboss, foil, Print Then Cut, attach, weld, slice, offset). Describe images generically; never name or copy specific copyrighted artwork.
8. In SELL mode, never suggest licensed characters, sports teams, brand logos, or copyrighted quotes, lyrics or catchphrases. If the requested theme implies one, pick an original alternative and explain why briefly in "note". Fill in "sellInfo" with a per-item material cost estimate and a realistic price range for the stated venue. In other modes "sellInfo" is null.
9. Add "safetyNotes" whenever relevant: food or drink contact (vinyl is not food-safe; keep designs away from lip areas), heat and burns, sharp blades, small parts for children under 3, ventilation for sprays and heat, and washing instructions for shirts.
10. Make each suggestion genuinely different. Avoid repeating any title listed under AVOID.`

export interface InventoryLine {
  id: string
  line: string
}

function fmtQty(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

export function supplyLine(s: Supply, catName: string): string {
  const parts = [s.id, s.name, catName, s.color || '-', `${fmtQty(s.quantity)} ${s.unit}`, s.dimensions || '-']
  const cost = s.unitCost !== undefined ? `cost ${formatMoney(s.unitCost)}/${s.unit}` : ''
  const extra = [s.subtype, s.finish, s.adhesive && s.adhesive !== 'none' ? s.adhesive : '', s.brand, cost].filter(Boolean).join(', ')
  return parts.join(' | ') + (extra ? ` | ${extra}` : '')
}

/** Categories most relevant to each goal, used to prioritise a very large stash. */
const GOAL_CATEGORIES: Record<GoalRequest['goal'], string[]> = {
  sell: ['adhesive-vinyl', 'iron-on', 'blanks-apparel', 'blanks-drinkware', 'blanks-home', 'printable', 'infusible-ink', 'acrylic', 'wood-chipboard', 'leather'],
  decor: ['adhesive-vinyl', 'cardstock-paper', 'wood-chipboard', 'blanks-home', 'felt', 'fabric', 'paint-markers', 'embellishments', 'foil-sheets', 'acrylic'],
  gift: ['iron-on', 'blanks-drinkware', 'blanks-apparel', 'cardstock-paper', 'leather', 'acrylic', 'metal-blanks', 'blanks-home', 'infusible-ink', 'printable'],
}

/**
 * Compact inventory text (spec 9.2): one line per supply. Past LARGE_INVENTORY items, drop empty
 * supplies, group by category and keep the goal's categories first, then trim the tail.
 */
export function compactInventory(supplies: Supply[], categories: Map<string, Category>, goal: GoalRequest['goal'], limit = LARGE_INVENTORY): { text: string; included: number; omitted: number } {
  const name = (id: string) => categories.get(id)?.name ?? 'Other'
  const sorted = [...supplies].sort((a, b) => name(a.category).localeCompare(name(b.category)) || a.name.localeCompare(b.name))
  if (sorted.length <= limit) {
    return { text: sorted.map((s) => supplyLine(s, name(s.category))).join('\n'), included: sorted.length, omitted: 0 }
  }
  const inStock = sorted.filter((s) => s.quantity > 0)
  const priority = GOAL_CATEGORIES[goal]
  const rank = (s: Supply) => {
    const i = priority.indexOf(s.category)
    return i === -1 ? priority.length : i
  }
  const chosen = [...inStock].sort((a, b) => rank(a) - rank(b)).slice(0, limit)
  const groups = new Map<string, Supply[]>()
  for (const s of chosen) {
    const g = groups.get(s.category) ?? []
    g.push(s)
    groups.set(s.category, g)
  }
  const blocks = [...groups.entries()]
    .sort(([a], [b]) => rank({ category: a } as Supply) - rank({ category: b } as Supply))
    .map(([cat, items]) => `## ${name(cat)}\n${items.map((s) => supplyLine(s, name(cat))).join('\n')}`)
  return { text: blocks.join('\n'), included: chosen.length, omitted: supplies.length - chosen.length }
}

/** Stable per-user context: machine, tools, equipment, inventory. Cached between requests. */
export function buildContextBlock(setup: UserSetup, supplies: Supply[], categories: Map<string, Category>, goal: GoalRequest['goal']): string {
  const m = effectiveMachine(setup)
  const machine = m
    ? [
        `Machine: ${machineLabel(m)}`,
        `Max cut width: ${m.cutWidthIn} in${m.matCutWidthIn ? ` (${m.matCutWidthIn} in on a mat)` : ''}`,
        m.maxMatlessLengthIn ? `Longest cut without a mat (Smart Materials): ${m.maxMatlessLengthIn} in` : '',
        `Max material thickness: ${m.maxMaterialThicknessMm} mm`,
        `Print Then Cut: ${m.printThenCut ? 'yes' : 'no'}`,
        ...m.notes.map((n) => `Note: ${n}`),
      ]
        .filter(Boolean)
        .join('\n')
    : 'Machine: unknown'

  const owned = new Set(setup.ownedToolIds)
  const tools = (m?.compatibleTools ?? [])
    .map((id) => getTool(id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => `${t.id} | ${t.name} | ${owned.has(t.id) ? 'OWNED' : 'not owned'} | can: ${t.enables.join(', ')}`)
    .join('\n')

  const equipment = EQUIPMENT.map((e) => `${e.id} | ${e.name} | ${setup.equipment.includes(e.id) ? 'OWNED' : 'not owned'}`).join('\n')
  const inv = compactInventory(supplies, categories, goal)

  return [
    '# MACHINE',
    machine,
    '',
    '# TOOLS (id | name | owned? | what it can do)',
    tools || '(none listed)',
    '',
    '# EQUIPMENT (id | name | owned?)',
    equipment,
    setup.equipmentOther ? `Other equipment the crafter owns: ${setup.equipmentOther}` : '',
    '',
    `# INVENTORY (id | name | category | color | quantity unit | size | details)${inv.omitted ? ` — ${inv.omitted} less relevant or empty items left out` : ''}`,
    inv.text || '(the inventory is empty)',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
}

export function describeRequest(req: GoalRequest, setup: UserSetup, person?: Person, avoidTitles: string[] = []): string {
  const lines: string[] = []
  if (req.goal === 'sell') {
    lines.push('GOAL: SELL — things to make and sell.')
    lines.push(`Where they will sell: ${req.where}`)
    lines.push(`How many to make: ${req.howMany}`)
    if (req.priceTarget) lines.push(`Target price: ${req.priceTarget}`)
    if (req.theme) lines.push(`Theme or season: ${req.theme}`)
  } else if (req.goal === 'decor') {
    lines.push('GOAL: DECORATE — decorations for their own home.')
    lines.push(`Room: ${req.room}`)
    if (req.season) lines.push(`Season or holiday: ${req.season}`)
    if (req.style) lines.push(`Style: ${req.style}`)
    if (req.sizeLimits) lines.push(`Size limits: ${req.sizeLimits}`)
  } else {
    lines.push('GOAL: GIFT — a handmade gift for someone.')
    if (person) {
      lines.push(`Recipient: ${person.name}${person.relationship ? ` (${person.relationship})` : ''}`)
      if (person.ageRange) lines.push(`Age range: ${person.ageRange}`)
      if (person.interests.length) lines.push(`Interests: ${person.interests.join(', ')}`)
      if (person.notes) lines.push(`About them: ${person.notes}`)
    } else {
      if (req.relationship) lines.push(`Recipient: ${req.relationship}`)
      if (req.ageRange) lines.push(`Age range: ${req.ageRange}`)
      if (req.interests) lines.push(`Interests: ${req.interests}`)
    }
    lines.push(`Occasion: ${req.occasion}`)
    if (req.budget) lines.push(`Budget for extra supplies: ${req.budget}`)
  }
  lines.push('')
  lines.push(`Crafter skill level: ${setup.skillLevel}`)
  if (setup.interests.length) lines.push(`Crafter interests: ${setup.interests.join(', ')}`)
  lines.push(`Hardest difficulty wanted: ${req.maxDifficulty} out of 5`)
  if (req.timeAvailable) lines.push(`Time available: ${req.timeAvailable}`)
  lines.push(req.onlyWhatIHave ? 'ONLY USE WHAT I HAVE: yes — "missing" must be empty.' : 'ONLY USE WHAT I HAVE: no — one or two small extra purchases are fine if clearly listed in "missing".')
  if (req.extra) lines.push(`Also: ${req.extra}`)
  if (avoidTitles.length) lines.push(`AVOID (already suggested or made): ${avoidTitles.join('; ')}`)
  lines.push('')
  lines.push(`Give ${req.count} suggestion${req.count === 1 ? '' : 's'}.`)
  return lines.join('\n')
}
