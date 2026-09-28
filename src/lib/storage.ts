import { getMeta, setMeta } from '../db'
import { nowIso } from './ids'

export interface StorageStatus {
  supported: boolean
  persisted: boolean
  usageBytes?: number
  quotaBytes?: number
}

/** Ask the browser to keep our data (spec 3.3). Called once on first run, and again from Settings. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    const granted = await navigator.storage.persist()
    await setMeta('persistRequestedAt', nowIso())
    return granted
  } catch {
    return false
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  if (!navigator.storage) return { supported: false, persisted: false }
  const persisted = (await navigator.storage.persisted?.().catch(() => false)) ?? false
  const est = await navigator.storage.estimate?.().catch(() => undefined)
  return { supported: true, persisted, usageBytes: est?.usage, quotaBytes: est?.quota }
}

/** First-run bookkeeping: remember when we started and ask for persistent storage once. */
export async function firstRunInit(): Promise<void> {
  if (!(await getMeta<string | null>('firstUseAt', null))) {
    await setMeta('firstUseAt', nowIso())
    await requestPersistence()
  }
}

export function formatBytes(n?: number): string {
  if (n === undefined) return 'unknown'
  if (n < 1024) return `${n} bytes`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}
