import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Spec Phase 4 accessibility pass: no serious or critical axe violations on the main screens.

async function finishSetup(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: "I'll do it later" }).click()
  await expect(page.getByRole('heading', { name: 'What would you like to make?' })).toBeVisible()
}

async function scan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([])
}

test('wizard is accessible', async ({ page }) => {
  await page.goto('/')
  await scan(page)
  await page.getByRole('button', { name: "Let's start" }).click()
  await scan(page)
  await page.getByRole('button', { name: 'Next →' }).click()
  await scan(page)
})

for (const path of ['/', '/inventory', '/add', '/add/manual', '/suggest/sell', '/suggest/gift', '/projects', '/projects/import', '/shopping', '/people', '/settings', '/help', '/help/ai-key']) {
  test(`${path} is accessible`, async ({ page }) => {
    await finishSetup(page)
    await page.goto(`/#${path}`)
    await page.waitForTimeout(300)
    await scan(page)
  })
}

test('extra abilities settings are accessible', async ({ page }) => {
  await finishSetup(page)
  await page.goto('/#/settings#extras')
  await expect(page.getByLabel('Paste your OpenAI key')).toBeVisible()
  await expect(page.getByLabel('Paste your Recraft key')).toBeVisible()
  await page.getByText('How to get a Recraft key').click()
  await scan(page)
})

test('color names in settings: add a color, accessible', async ({ page }) => {
  // Use the in-app picker everywhere (Chrome's screen eyedropper can't be driven by a test).
  await page.addInitScript(() => {
    delete (window as { EyeDropper?: unknown }).EyeDropper
  })
  await finishSetup(page)
  await page.goto('/#/settings')
  await page.getByText('Color names').click()
  await expect(page.getByLabel('Name for Light yellow')).toBeVisible()
  await page.getByRole('button', { name: 'Pick the color for the new color' }).click()
  await page.getByLabel('Or choose from the color wheel').fill('#98e0c0')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByLabel('New color name').fill('Seafoam')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByLabel('Name for Seafoam')).toBeVisible()
  await expect(page.getByText('(your list)')).toBeVisible()
  await scan(page)
})
