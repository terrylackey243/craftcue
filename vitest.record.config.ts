import { mergeConfig } from 'vitest/config'
import base from './vite.config'

// Separate config so the live-recording suite never runs with `npm test` or in CI.
const config = mergeConfig(base, { test: { environment: 'node' } })
config.test!.include = ['tests/record/**/*.test.ts']
export default config
