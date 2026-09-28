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

for (const path of ['/', '/inventory', '/add', '/add/manual', '/suggest/sell', '/suggest/gift', '/projects', '/shopping', '/people', '/settings', '/help', '/help/ai-key']) {
  test(`${path} is accessible`, async ({ page }) => {
    await finishSetup(page)
    await page.goto(`/#${path}`)
    await page.waitForTimeout(300)
    await scan(page)
  })
}
