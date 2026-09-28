import { defineConfig, devices } from '@playwright/test'

// Browser tests with accounts + sync against a local Supabase. Run via scripts/test-sync-e2e.sh.
export default defineConfig({
  testDir: 'tests/e2e-sync',
  timeout: 90_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npx vite preview --outDir dist-sync --port 4174 --strictPort', port: 4174, reuseExistingServer: false },
})
