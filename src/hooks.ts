import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { accountStore, type AccountState } from './lib/cloud/account'
import { db } from './db'
import { allCategories, getApiKey, getSetup, saveSetup } from './lib/repo'
import type { Category, UserSetup } from './types'

export function useSetup(): UserSetup | undefined {
  return useLiveQuery(() => getSetup(), [])
}

/**
 * Setup plus an optimistic `patch`: edits show instantly and save in the background, so a tapped
 * checkbox never looks ignored while the database write finishes.
 */
export function useSetupEditor(): [UserSetup | undefined, (p: Partial<UserSetup>) => void] {
  const stored = useSetup()
  const [pending, setPending] = useState<Partial<UserSetup>>({})
  const patch = useCallback((p: Partial<UserSetup>) => {
    setPending((prev) => ({ ...prev, ...p }))
    void saveSetup(p)
  }, [])
  return [stored ? { ...stored, ...pending } : undefined, patch]
}

export function useCategories(): Category[] {
  return useLiveQuery(() => allCategories(), []) ?? []
}

export function useCategoryMap(): Map<string, Category> {
  const cats = useCategories()
  return new Map(cats.map((c) => [c.id, c]))
}

/** undefined while loading, '' when no key is saved. */
export function useApiKey(): string | undefined {
  return useLiveQuery(async () => (await getApiKey()) ?? '', [])
}

export function useSupplies() {
  return useLiveQuery(() => db.supplies.orderBy('name').toArray(), [])
}

/** Signed-in account and sync status (always "off" in builds without a server). */
export function useAccount(): AccountState {
  return useSyncExternalStore(accountStore.subscribe, accountStore.get, accountStore.get)
}
