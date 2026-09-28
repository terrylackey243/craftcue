import { mergeConfig } from 'vitest/config'
import base from './vite.config'

// Database/security tests against a local Supabase; run with scripts/test-db.sh.
const config = mergeConfig(base, { test: { environment: 'node', testTimeout: 30_000, fileParallelism: false } })
config.test!.include = ['tests/db/**/*.test.ts']
export default config
