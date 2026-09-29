import { readFileSync } from 'node:fs'
import type Anthropic from '@anthropic-ai/sdk'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import DesignView from '../../src/components/DesignView'
import { setAiClientForTests } from '../../src/lib/ai/aiClient'
import { setFontLoader } from '../../src/lib/design/fonts'
import { db } from '../../src/db'
import { saveProject, saveSetup, setApiKey } from '../../src/lib/repo'
import type { Project, Supply } from '../../src/types'

const recorded: Anthropic.Message = JSON.parse(readFileSync('tests/fixtures/design-botanical.json', 'utf8'))

beforeAll(() => {
  setFontLoader(async (file) => {
    const b = readFileSync(`public/fonts/${file}`)
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  })
})
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await saveSetup({ setupComplete: true, machineId: 'cricut-maker-5' })
  await setApiKey('sk-ant-test-key-0000000000000000000000')
})
afterEach(() => setAiClientForTests(null))

describe('project design section', () => {
  it('designs, shows the mock-up and cut layers, and downloads the SVG', async () => {
    let calls = 0
    setAiClientForTests({ createMessage: async () => (calls++, recorded) })
    const project = await saveProject({ title: 'Layered Paper Botanical Wall Art', summary: 'Leaves on a stem', goal: 'decor', goalContext: {}, status: 'idea', uses: [], missing: [], toolsNeeded: [], equipmentNeeded: [], steps: [], designTips: '', safetyNotes: [], aiGenerated: true })
    const supplies: Supply[] = []
    const user = userEvent.setup()
    const { rerender } = render(
      <MemoryRouter>
        <DesignView project={project as Project} supplies={supplies} />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /Design it for me/ }))
    // The design is saved on the project; show the updated project.
    await waitFor(async () => expect((await db.projects.get(project.id))?.design).toBeDefined())
    const saved = (await db.projects.get(project.id))!
    rerender(
      <MemoryRouter>
        <DesignView project={saved} supplies={supplies} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('img', { name: /Mock-up of/ })).toBeInTheDocument()
    expect(calls).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Cut layers' }))
    expect(screen.getAllByRole('img', { name: /pieces$/ }).length).toBeGreaterThanOrEqual(3)

    const created: Blob[] = []
    URL.createObjectURL = vi.fn((b: Blob) => (created.push(b), 'blob:x'))
    URL.revokeObjectURL = vi.fn()
    await user.click(screen.getByRole('button', { name: /Download SVG for Design Space/ }))
    const svg = await created[0].text()
    expect(svg).toMatch(/width="8in" height="10in"/)
    expect(screen.getByText('How to use this in Design Space')).toBeInTheDocument()
  })
})
