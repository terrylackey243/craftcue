import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { accountStore, type AccountState } from './lib/cloud/account'
import { db, type SecretKey } from './db'
import { allCategories, getApiKey, getSecret, getSetup, saveSetup } from './lib/repo'
import type { Category, UserSetup } from './types'
import { COLOR_LIST_BASE, DEFAULT_COLORS, migrateColorList, setColorList, type ColorEntry } from './lib/colorList'

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

/** The crafter's color list, and a way to save a changed one (synced with their settings). */
export function useColorList(): [ColorEntry[], (list: ColorEntry[]) => Promise<void>] {
  const setup = useSetup()
  const list = (setup?.colorListBase === COLOR_LIST_BASE && setup.colorList?.length ? setup.colorList : migrateColorList(setup?.colorList, setup?.colorListBase)) ?? DEFAULT_COLORS
  const save = useCallback(async (next: ColorEntry[]) => {
    setColorList(next)
    await saveSetup({ colorList: next, colorListBase: COLOR_LIST_BASE })
  }, [])
  return [list, save]
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

/** A saved key ('' when none; undefined while loading). */
export function useSecret(key: SecretKey): string | undefined {
  return useLiveQuery(async () => (await getSecret(key)) ?? '', [key])
}

export function useSupplies() {
  return useLiveQuery(() => db.supplies.orderBy('name').toArray(), [])
}

/** Signed-in account and sync status (always "off" in builds without a server). */
export function useAccount(): AccountState {
  return useSyncExternalStore(accountStore.subscribe, accountStore.get, accountStore.get)
}
