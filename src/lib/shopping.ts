// Shopping list (spec 5.8): missing items from saved projects + low/out-of-stock supplies.
import type { Project, Supply } from '../types'

export interface ShoppingLine {
  key: string
  item: string
  detail: string
  estCost?: string
  kind: 'project' | 'low' | 'out'
  projectIds: string[]
}

export function lowAt(s: Supply): number {
  return s.lowAt ?? 1
}

export function stockLevel(s: Supply): 'out' | 'low' | 'ok' {
  if (s.quantity <= 0) return 'out'
  if (s.quantity <= lowAt(s)) return 'low'
  return 'ok'
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function buildShoppingList(projects: Project[], supplies: Supply[]): ShoppingLine[] {
  const lines = new Map<string, ShoppingLine>()
  for (const p of projects) {
    if (p.status !== 'idea' && p.status !== 'planned') continue
    for (const m of p.missing) {
      const key = `p:${norm(m.item)}`
      const existing = lines.get(key)
      if (existing) {
        if (!existing.projectIds.includes(p.id)) existing.projectIds.push(p.id)
        existing.detail = `For ${existing.projectIds.length} projects`
      } else {
        lines.set(key, { key, item: m.item, detail: `For “${p.title}”`, estCost: m.estCost || undefined, kind: 'project', projectIds: [p.id] })
      }
    }
  }
  for (const s of supplies) {
    const level = stockLevel(s)
    if (level === 'ok') continue
    const key = `s:${s.id}`
    lines.set(key, {
      key,
      item: [s.name, s.color].filter(Boolean).join(' — '),
      detail: level === 'out' ? 'Out of stock' : `Running low (${s.quantity} ${s.unit} left)`,
      kind: level,
      projectIds: [],
    })
  }
  return [...lines.values()]
}

export function shoppingText(lines: ShoppingLine[], checked: Set<string>): string {
  const open = lines.filter((l) => !checked.has(l.key))
  if (!open.length) return 'CraftCue shopping list: nothing to buy!'
  return ['CraftCue shopping list', '', ...open.map((l) => `☐ ${l.item}${l.estCost ? ` (~${l.estCost})` : ''} — ${l.detail}`)].join('\n')
}
