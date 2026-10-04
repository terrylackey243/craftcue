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
  await page.getByRole('button', { name: 'Use one Bright cardstock, Cherry' }).click()
  await page.screenshot({ path: testInfo.outputPath('mixed-stash.png'), fullPage: true })
  // Searching a color finds it inside the pack.
  await page.goto('/#/')
  await page.goto('/#/inventory')
  await page.getByLabel('Search your stash').fill('moss')
  await expect(page.getByText('Moss', { exact: true })).toBeVisible()
  await expect(page.getByText('Cherry', { exact: true })).toHaveCount(0)
})

test('colors in a mixed pack can be dragged into the order printed on the pack', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: /Add supplies now/ }).click()
  await page.getByRole('link', { name: /Type it in/ }).click()
  await page.getByRole('button', { name: 'A pack with several colors' }).click()
  await page.getByLabel('What is one sheet? (without the color)').fill('Test cardstock')
  // Typing then Enter moves straight to the next color.
  await page.getByLabel('Color 1', { exact: true }).fill('Blue')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Green')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Red')
  const order = () => page.locator('input[id^="color-"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
  expect(await order()).toEqual(['Blue', 'Green', 'Red'])

  // Keyboard: pick Red up, move it to the top.
  // Like a person: pick it up, wait until it shows as picked up, then move it.
  await page.getByRole('button', { name: 'Drag to reorder Red' }).focus()
  await page.keyboard.press('Space')
  await expect(page.locator('li.ring-brand-500')).toHaveCount(1)
  await page.waitForTimeout(300) // dnd-kit measures the rows right after pick-up
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(250)
  }
  await page.keyboard.press('Space')
  await expect.poll(order).toEqual(['Red', 'Blue', 'Green'])

  // Mouse / finger: drag Green above Blue.
  const green = page.getByRole('button', { name: 'Drag to reorder Green' })
  const blue = page.getByRole('button', { name: 'Drag to reorder Blue' })
  const from = (await green.boundingBox())!
  const to = (await blue.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 10 })
  await page.mouse.up()
  await expect.poll(order).toEqual(['Red', 'Green', 'Blue'])

  // The saved pack keeps that order in My stash.
  await page.getByRole('button', { name: /Save 3 colors/ }).click()
  await page.goto('/#/inventory')
  await page.getByRole('button', { name: /Test cardstock/ }).click()
  const names = await page.locator('li li a span.font-semibold').allTextContents()
  expect(names).toEqual(['Red', 'Green', 'Blue'])
})

test('a pack’s barcode, reordering in My stash, and scanning it again to add another pack', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: /Add supplies now/ }).click()
  await page.getByRole('link', { name: /Type it in/ }).click()
  await page.getByRole('button', { name: 'A pack with several colors' }).click()
  await page.getByLabel('What is one sheet? (without the color)').fill('Scan cardstock')
  await page.getByLabel('Barcode (UPC)', { exact: true }).fill('036000291452')
  await page.getByLabel('Color 1', { exact: true }).fill('Blue')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Red')
  await page.getByRole('button', { name: 'Apply to all' }).click()
  await page.getByRole('button', { name: /Save 2 colors/ }).click()
  await expect(page.getByText(/Saved “Scan cardstock/)).toBeVisible()

  // Reorder in My stash.
  await page.goto('/#/inventory')
  await page.getByRole('button', { name: /Scan cardstock/ }).click()
  await page.getByRole('button', { name: '↕ Change order' }).click()
  await page.getByRole('button', { name: 'Drag to reorder Red' }).focus()
  await page.keyboard.press('Space')
  await expect(page.locator('li.ring-brand-500')).toHaveCount(1)
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(250)
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect.poll(() => page.locator('li li a span.font-semibold').allTextContents()).toEqual(['Red', 'Blue'])

  // Scan the same barcode (typed, since tests have no camera): offered to add another pack.
  await page.goto('/#/add/scan')
  await page.getByLabel('Or type the numbers under the barcode').fill('036000291452')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByText('You already have this pack')).toBeVisible()
  await page.getByRole('button', { name: /Add another pack/ }).click()
  await page.goto('/#/inventory')
  await page.getByRole('button', { name: /Scan cardstock/ }).click()
  await expect(page.getByRole('group', { name: 'Quantity of Scan cardstock, Red' })).toContainText('6')
})

test('paste a color list into a saved pack (Terry’s 30 markers)', async ({ page }) => {
  const list = ['Black', 'Red', 'Blue', 'Green', 'Yellow', 'Sour Apple', 'Candy Corn', 'Blueberry', 'Candy Crystal', 'Very Berry', 'Cactus Pink', 'Bluebonnet', 'Lavender', 'Honeysuckle', 'Sage', 'Armadillo', 'Geode', 'Brick', 'Adobe Clay', 'Moccasin', 'Jade', 'Gemstone Blue', 'Wine', 'Pink Crystal', 'Coral', 'Turquoise', 'Tawny', 'Light Green', 'Light Turquoise', 'Magenta']
  const pasted = list.map((c, i) => `* ${c}${i === list.length - 1 ? '.' : i === list.length - 2 ? '' : ','}`).join('\n')

  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: /Add supplies now/ }).click()
  await page.getByRole('link', { name: /Type it in/ }).click()
  await page.getByRole('button', { name: 'A pack with several colors' }).click()
  await page.getByLabel('Type of supply').selectOption('paint-markers')
  await page.getByLabel(/What is one .* \(without the color\)/).fill('Fine Point Pens')
  await page.getByLabel('Color 1', { exact: true }).fill('Sour Apple')
  await page.getByRole('button', { name: /Save 1 color/ }).click()
  await expect(page.getByText(/Saved “Fine Point Pens/)).toBeVisible()

  // Open the pack from My stash, then add the rest by pasting.
  await page.goto('/#/inventory')
  await page.getByRole('button', { name: /Fine Point Pens/ }).click()
  await page.getByRole('link', { name: '✏️ Edit pack' }).click()
  await page.getByRole('button', { name: '➕ Add colors to this pack' }).click()
  await page.getByLabel(/Colors to add/).fill(pasted)
  await expect(page.getByText('30 colors found: 29 new, 1 already here (Sour Apple).')).toBeVisible()
  await page.getByRole('button', { name: 'Add 29 colors' }).click()
  await expect(page.getByText('Added 29 colors, and put the pack in your list’s order.')).toBeVisible()

  // One low-stock level for all 30 pens, set once for the pack.
  await page.getByRole('button', { name: 'Less warn when each color is down to' }).click()
  await page.getByRole('button', { name: 'Save for all 30 colors' }).click()
  await expect(page.getByText('Saved for all 30 colors.')).toBeVisible()
  const levels = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const req = indexedDB.open('craftcue')
        req.onsuccess = () => {
          const all = req.result.transaction('supplies').objectStore('supplies').getAll()
          all.onsuccess = () => resolve(all.result.map((s: { lowAt?: number }) => s.lowAt ?? 1))
        }
      }),
  )
  expect(levels).toHaveLength(30)
  expect(levels.every((n) => n === 0)).toBe(true)

  await page.goto('/#/inventory')
  const group = page.getByRole('button', { name: /Fine Point Pens/ })
  await expect(group).toContainText('30 colors')
  await group.click()
  const names = await page.locator('li li a span.font-semibold').allTextContents()
  expect(names).toEqual(list)
})

test('a saved design: mock-up, cut layers, SVG download, and accessible', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: "I'll do it later" }).click()
  await expect(page.getByRole('heading', { name: 'What would you like to make?' })).toBeVisible()
  await page.goto('/#/settings')
  await page.locator('input[aria-label="Choose a backup file"]').setInputFiles('tests/fixtures/demo-with-design.json')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Replace everything with the backup' }).click()
  await expect(page.getByText('Everything has been restored')).toBeVisible()

  await page.goto('/#/projects/proj-bot')
  await expect(page.getByRole('img', { name: /Mock-up of/ })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Cut layers' }).click()
  await expect(page.getByText('Terra Green cardstock')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download SVG for Design Space/ }).click()
  const file = await (await download).path()
  const svg = (await import('node:fs')).readFileSync(file, 'utf8')
  expect(svg).toContain('width="8in" height="10in"')
  expect(svg).toContain('(score)')

  const AxeBuilder = (await import('@axe-core/playwright')).default
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
})

test('a photo can be dragged in or pasted, not only chosen', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: "I'll do it later" }).click()
  await expect(page.getByRole('heading', { name: 'What would you like to make?' })).toBeVisible()

  // A real PNG made in the page, handed over the way a drop or a paste would.
  const send = (how: 'drop' | 'paste') =>
    page.evaluate(async (how) => {
      const c = document.createElement('canvas')
      c.width = c.height = 40
      c.getContext('2d')!.fillRect(0, 0, 40, 40)
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
      const dt = new DataTransfer()
      dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }))
      const zone = document.querySelector('[data-testid="photo-drop"]')!
      if (how === 'drop') {
        zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
      } else document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
    }, how)

  await page.goto('/#/add/manual')
  // The hint is for computers; touch-only screens just show the button (drops still work there).
  const hint = page.getByText(/drag a picture here, or paste one/)
  if (testInfo.project.name === 'ipad-webkit') await expect(hint).toBeHidden()
  else await expect(hint).toBeVisible()
  await send('drop')
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Add a photo')).toBeVisible()
  await send('paste')
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()

  // Reading a photo needs smart suggestions: a dropped photo opens the same setup panel as the button.
  await page.goto('/#/add/photo')
  await expect(page.getByRole('button', { name: /Take or choose a photo/ })).toBeVisible()
  await send('drop')
  await expect(page.getByRole('dialog', { name: /quick one-time setup/ })).toBeVisible()
})

test('a project found elsewhere: SVG in, materials matched, priced', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: "Let's start" }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await page.getByRole('button', { name: "I'll do it later" }).click()
  await expect(page.getByRole('heading', { name: 'What would you like to make?' })).toBeVisible()
  // Two colors of cardstock in the stash, with prices.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('craftcue')
        req.onsuccess = () => {
          const tx = req.result.transaction('supplies', 'readwrite')
          const store = tx.objectStore('supplies')
          const base = { name: 'Cardstock', category: 'cardstock-paper', dimensions: '12 x 12 in', quantity: 8, unit: 'sheet', unitCost: 0.14, source: 'manual', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
          store.put({ ...base, id: 'blk', color: 'Eclipse Black' })
          store.put({ ...base, id: 'org', color: 'Orbit Orange' })
          tx.oncomplete = () => resolve()
        }
      }),
  )
  await page.goto('/#/projects')
  await page.getByRole('link', { name: /A project I found/ }).click()
  await page.getByLabel('SVG cut files').setInputFiles('tests/fixtures/svg/ghost-test.svg')
  await expect(page.getByText(/2 colors, 3 pieces, finished size about/)).toBeVisible()
  await expect(page.getByLabel(/^Material for/).nth(0)).toHaveValue('org') // biggest color first
  await expect(page.getByLabel(/^Material for/).nth(1)).toHaveValue('blk')
  await expect(page.getByLabel('Name')).toHaveValue('ghost test')
  await page.getByLabel(/terms of use/).fill('Commercial use by creating physical products allowed.')
  await page.getByRole('button', { name: 'Save project' }).click()

  await expect(page.getByRole('heading', { name: 'ghost test' })).toBeVisible()
  await expect(page.getByText('Price it')).toBeVisible()
  // 2 sheets × $0.14 + 1 hr × $15, + 20% → $19; Etsy covers fees → $22.
  await expect(page.getByText('$19.00').first()).toBeVisible()
  await expect(page.getByText('$22.00')).toBeVisible()
  await expect(page.getByText('Commercial use by creating physical products allowed.')).toBeVisible()
})
