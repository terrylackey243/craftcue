// App-wide settings that a fork might want to change. Kept in one place on purpose.

export const APP_NAME = 'CraftCue'

/** Optional "buy me a coffee" style link shown in About. Empty = hidden. */
export const SUPPORT_URL = ''

export const REPO_URL = 'https://github.com/terrylackey243/craftcue'

/** Bumped whenever the backup file format changes; see src/lib/backup.ts migrations. */
export const BACKUP_SCHEMA_VERSION = 2

/** Above this many supplies the recommendation prompt groups and trims the inventory (spec 9.2). */
export const LARGE_INVENTORY = 300

declare const __APP_VERSION__: string
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
