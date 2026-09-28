import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Spec 12: wizard → add item → export/import. Also covers Phase 1's "clear site data, import,
// see everything restored" by wiping IndexedDB between export and import.

test('first run, add supplies, back up, wipe, restore', async ({ page }, testInfo) => {
  await page.goto('/')

  // Wizard
  await expect(page.getByRole('heading', { name: 'Welcome to CraftCue' })).toBeVisible()
  await expect(page.getByText('Your data stays on this device.')).toBeVisible()
  await page.getByRole('button', { name: "Let's start" }).click()
  await page.getByRole('radio', { name: /Cricut Maker 5/ }).click()
  await page.getByRole('button', { name: 'Next →' }).click()
  await expect(page.getByRole('heading', { name: 'Which tools do you have for it?' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Fine-point cutting tool/ })).toBeChecked()
  await page.getByRole('checkbox', { name: /Scoring tool \(Maker 5/ }).check()
  await page.getByRole('button', { name: 'Next →' }).click()
  await page.getByRole('button', { name: 'Heat press', exact: true }).click()
  await page.getByRole('button', { name: 'Next →' }).click()
  await page.getByRole('button', { name: 'Skip' }).click() // about you
  await page.getByRole('button', { name: 'Maybe later' }).click() // AI
  await page.getByRole('button', { name: /Add supplies now/ }).click()

  // Manual add, two items via "save and add another"
  await page.getByRole('link', { name: /Type it in/ }).click()
  for (const [name, color] of [
    ['Glossy permanent vinyl', 'black'],
    ['Kraft cardstock', 'brown'],
  ]) {
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('Color').fill(color)
    await page.getByRole('button', { name: 'More quantity' }).click()
    await page.getByRole('button', { name: 'Save and add another' }).click()
    await expect(page.getByText(`Saved “${name}”`)).toBeVisible()
  }
  await page.screenshot({ path: testInfo.outputPath('add-form.png'), fullPage: true })

  // Inventory shows both; quick +/- works
  await page.goto('/#/inventory')
  await expect(page.getByText('Glossy permanent vinyl')).toBeVisible()
  await expect(page.getByText('Kraft cardstock')).toBeVisible()
  await page.getByRole('button', { name: 'Add one Kraft cardstock' }).click()
  await expect(page.getByRole('group', { name: 'Quantity of Kraft cardstock' })).toContainText('3')
  await page.screenshot({ path: testInfo.outputPath('inventory.png'), fullPage: true })

  // Export
  await page.goto('/#/settings')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Save a backup/ }).click()
  const download = await downloadPromise
  const file = testInfo.outputPath('backup.json')
  await download.saveAs(file)
  const backup = JSON.parse(readFileSync(file, 'utf8'))
  expect(backup.app).toBe('craftcue')
  expect(backup.data.supplies).toHaveLength(2)

  // "Clear site data"
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('craftcue')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => resolve()
    })
  })
  await page.goto('/')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome to CraftCue' })).toBeVisible()

  // Finish a minimal setup, then restore from the file
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: "I'll do it later" }).click()
  await expect(page.getByRole('heading', { name: 'What would you like to make?' })).toBeVisible()
  await page.goto('/#/settings')
  await page.locator('input[type=file][accept*="json"]').setInputFiles(file)
  await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Replace everything with the backup' }).click()
  await expect(page.getByText('Everything has been restored from the backup.')).toBeVisible()

  await page.goto('/#/inventory')
  await expect(page.getByText('Glossy permanent vinyl')).toBeVisible()
  await expect(page.getByText('Kraft cardstock')).toBeVisible()
  await page.goto('/#/settings')
  await page.getByText('Machine & tools').click()
  await expect(page.getByRole('radio', { name: /Cricut Maker 5/ })).toHaveAttribute('aria-checked', 'true')
})

test('AI buttons without a key open the friendly setup panel, never an error', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: "I'll do it later" }).click()
  await page.getByRole('link', { name: /Decorate/ }).click()
  await page.getByRole('button', { name: /Get ideas/ }).click()
  await expect(page.getByRole('dialog', { name: /quick one-time setup/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /step by step/ })).toBeVisible()
})

test('a mixed-color pack is saved per color and grouped in My stash', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: /Add supplies now/ }).click()
  await page.getByRole('link', { name: /Type it in/ }).click()
  await page.getByRole('button', { name: 'A pack with several colors' }).click()
  await page.getByLabel('What is one sheet? (without the color)').fill('Bright cardstock')
  await page.getByLabel('Pack name (optional)').fill('Rainbow pack')
  for (const [i, c] of ['Cherry', 'Lemon', 'Sky', 'Moss'].entries()) {
    await page.getByLabel(`Color ${i + 1}`, { exact: true }).fill(c)
    if (i < 3) await page.getByLabel(`Color ${i + 1}`, { exact: true }).press('Enter')
  }
  await page.getByRole('button', { name: 'Apply to all' }).click()
  await page.getByLabel('Price for one pack ($) (optional)').fill('6')
  await expect(page.getByText("That's $0.50 per sheet, for every color.")).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mixed-form.png'), fullPage: true })
  await page.getByRole('button', { name: /Save 4 colors/ }).click()
  await expect(page.getByText('Saved “Rainbow pack (4 colors)”')).toBeVisible()

  await page.goto('/#/inventory')
  const group = page.getByRole('button', { name: /Rainbow pack/ })
  await expect(group).toContainText('4 colors')
  await expect(group).toContainText('12 sheets')
  await expect(page.getByText('Cherry', { exact: true })).toHaveCount(0) // closed until tapped
  await group.click()
  await expect(page.getByText('Cherry', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Use one Bright cardstock' }).first().click()
  await page.screenshot({ path: testInfo.outputPath('mixed-stash.png'), fullPage: true })
  // Searching a color finds it inside the pack.
  await page.goto('/#/')
  await page.goto('/#/inventory')
  await page.getByLabel('Search your stash').fill('moss')
  await expect(page.getByText('Moss', { exact: true })).toBeVisible()
  await expect(page.getByText('Cherry', { exact: true })).toHaveCount(0)
})
