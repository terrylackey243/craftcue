import { expect, test, type Page } from '@playwright/test'

// Two browser contexts = two devices, one account, against a real local Supabase.
// Run with scripts/test-sync-e2e.sh (it builds the app with sync on and creates the test user).

const EMAIL = process.env.E2E_EMAIL!
const PASSWORD = process.env.E2E_PASSWORD!

async function signInThroughWizard(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to CraftCue' })).toBeVisible()
  await page.getByLabel('Email address').fill(EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('a stash entered on one device appears on another', async ({ browser }) => {
  // Device 1: first ever sign-in, finish setup, add a supply.
  const mac = await (await browser.newContext()).newPage()
  await signInThroughWizard(mac)
  await expect(mac.getByRole('heading', { name: 'Which cutting machine do you have?' })).toBeVisible()
  for (let i = 0; i < 4; i++) await mac.getByRole('button', { name: 'Skip' }).click()
  await mac.getByRole('button', { name: 'Maybe later' }).click()
  await mac.getByRole('button', { name: /Add supplies now/ }).click()
  await mac.getByRole('link', { name: /Type it in/ }).click()
  await mac.getByLabel('Name', { exact: true }).fill('Synced glitter vinyl')
  await mac.getByRole('button', { name: 'Save and add another' }).click()
  await expect(mac.getByText('Saved “Synced glitter vinyl”')).toBeVisible()
  await mac.waitForTimeout(2500)
  await expect(mac.getByRole('link', { name: /Sync status: Synced$/ }).first()).toBeVisible({ timeout: 15_000 })

  // Device 2: brand-new browser. Signing in skips setup (it's already done) and brings the stash.
  const ipad = await (await browser.newContext()).newPage()
  await signInThroughWizard(ipad)
  await expect(ipad.getByRole('heading', { name: 'What would you like to make?' })).toBeVisible({ timeout: 15_000 })
  await ipad.goto('/#/inventory')
  await expect(ipad.getByText('Synced glitter vinyl')).toBeVisible()

  // Edit on device 2, sync on device 1: the change arrives.
  await ipad.getByRole('button', { name: 'Add one Synced glitter vinyl' }).click()
  // Sync waits 1.5 s after the last edit; let that pass, then wait until nothing is pending.
  await ipad.waitForTimeout(2500)
  await expect(ipad.getByRole('link', { name: /Sync status: Synced$/ }).first()).toBeVisible({ timeout: 15_000 })
  await mac.goto('/#/settings')
  await mac.getByRole('button', { name: /Sync now/ }).click()
  await expect(mac.getByRole('link', { name: /Sync status: Synced$/ }).first()).toBeVisible({ timeout: 15_000 })
  await mac.goto('/#/inventory')
  await expect(mac.getByRole('group', { name: 'Quantity of Synced glitter vinyl' })).toContainText('2', { timeout: 10_000 })

  // Signing out removes the stash from that device; it stays in the account.
  await ipad.goto('/#/settings')
  ipad.once('dialog', (d) => d.accept())
  await ipad.getByRole('button', { name: 'Sign out' }).click()
  await ipad.goto('/#/inventory')
  await expect(ipad.getByText('Synced glitter vinyl')).toHaveCount(0)
})

test('sign-ups are refused on a closed server', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  await expect(page.getByRole('button', { name: 'Create a new account instead' })).toHaveCount(0)
  await page.getByLabel('Email address').fill('stranger@example.com')
  await page.getByLabel('Password', { exact: true }).fill('some-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText("That email and password don't match")).toBeVisible()
})
