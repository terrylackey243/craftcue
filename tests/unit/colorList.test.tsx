import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ColorNameCheck from '../../src/components/ColorNameCheck'
import { db } from '../../src/db'
import { addColor, DEFAULT_COLORS, deltaE, matchColor, nameForHex, removeColor, renameColor, setColorList, type ColorEntry } from '../../src/lib/colorList'
import { getSetup, saveSetup } from '../../src/lib/repo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await saveSetup({ setupComplete: true })
})
afterEach(() => setColorList(undefined))

describe('the color list', () => {
  it('names Terry’s picked swatches after the closest color, the way eyes see it', () => {
    expect(deltaE('#ffffff', '#ffffff')).toBe(0)
    expect(nameForHex('#f0e08a')).toBe('Light yellow') // was "Peach"
    expect(nameForHex('#e0e8f4')).toBe('Pale blue') // was "Ivory 2"
    expect(nameForHex('#b0c4e0')).toBe('Baby blue')
    expect(nameForHex('#f4c4a0')).toBe('Peach')
    expect(nameForHex('#c62828')).toBe('Red')
  })

  it('says when nothing on the list is close, and learns shades for a name', () => {
    const tiny: ColorEntry[] = [{ name: 'Red', hexes: ['#c62828'] }, { name: 'Blue', hexes: ['#1e6fd0'] }]
    expect(matchColor('#2e8b3e', tiny)).toBeNull() // a green: not on this list
    const learned = addColor(tiny, 'blue', '#5aa0e8')
    expect(learned.find((e) => e.name === 'Blue')!.hexes).toEqual(['#1e6fd0', '#5aa0e8'])
    expect(matchColor('#5aa0e8', learned)?.entry.name).toBe('Blue')
    expect(addColor(tiny, 'Mint', '#98e0c0').map((e) => e.name)).toEqual(['Red', 'Blue', 'Mint'])
    expect(renameColor(tiny, 'Red', 'Blue')).toBe(tiny) // no duplicate names
    expect(renameColor(tiny, 'Red', 'Scarlet')[0].name).toBe('Scarlet')
    expect(removeColor(tiny, 'red').map((e) => e.name)).toEqual(['Blue'])
  })

  it('the standard list has no brand names', () => {
    for (const bad of ['Rocket Red', 'Astro White', 'Lunar Blue', 'Sour Apple']) expect(DEFAULT_COLORS.some((e) => e.name === bad)).toBe(false)
  })
})

describe('a picked color that is not on the list', () => {
  const tiny: ColorEntry[] = [{ name: 'Red', hexes: ['#c62828'] }, { name: 'Blue', hexes: ['#1e6fd0'] }]

  it('can be added as a new color', async () => {
    await saveSetup({ colorList: tiny })
    let named = ''
    render(<ColorNameCheck hex="#2e8b3e" onName={(n) => (named = n)} />)
    expect(await screen.findByText(/isn't close to any color on your list/)).toBeInTheDocument()
    expect(screen.getByLabelText('Name for the new color')).toHaveValue('Green')
    await userEvent.click(screen.getByRole('button', { name: 'Add to my colors' }))
    await waitFor(async () => expect((await getSetup()).colorList?.map((e) => e.name)).toEqual(['Red', 'Blue', 'Green']))
    await waitFor(() => expect(named).toBe('Green'))
  })

  it('or taught to the right color', async () => {
    await saveSetup({ colorList: tiny })
    let named = ''
    render(<ColorNameCheck hex="#5aa0e8" onName={(n) => (named = n)} />)
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'Blue')
    await waitFor(async () => expect((await getSetup()).colorList?.find((e) => e.name === 'Blue')?.hexes).toEqual(['#1e6fd0', '#5aa0e8']))
    await waitFor(() => expect(named).toBe('Blue'))
  })
})

describe('learning from names the crafter typed', () => {
  it('teaches shades to names on the list, adds plain colors, asks about the rest', async () => {
    const { learnFromNames } = await import('../../src/lib/colorList')
    const list: ColorEntry[] = [{ name: 'Light green', hexes: ['#90d090'] }, { name: 'Mint', hexes: ['#98e0c0'] }, { name: 'Red', hexes: ['#c62828'] }]
    const r = learnFromNames(list, [
      { name: 'Mint', hex: '#8fd09a' }, // matched "Light green", renamed to Mint: learn
      { name: 'Light green 2', hex: '#90d090' }, // unchanged suggestion: nothing
      { name: 'Dark teal', hex: '#0e5555' }, // a plain color not on the list: add
      { name: 'Rocket Red', hex: '#d02020' }, // brand-looking: ask
      { name: 'Seafoam', hex: '#7fd8c0' }, // unknown word: ask
      { name: 'Red' }, // no swatch: nothing
    ])
    expect(r.learned).toEqual(['Mint', 'Dark teal'])
    expect(r.list.find((e) => e.name === 'Mint')!.hexes).toEqual(['#98e0c0', '#8fd09a'])
    expect(r.ask.map((a) => a.name)).toEqual(['Rocket Red', 'Seafoam'])
    expect(nameForHex('#8fd09a', r.list)).toBe('Mint') // next time it's Mint
  })

  it('saving a pack says what it learned and offers to add the rest', async () => {
    const { learnAndTell } = await import('../../src/components/Toast')
    const { render: r2, screen: s2 } = await import('@testing-library/react')
    const { Toasts } = await import('../../src/components/Toast')
    await saveSetup({ colorList: [{ name: 'Light green', hexes: ['#90d090'] }, { name: 'Mint', hexes: ['#98e0c0'] }] })
    setColorList((await getSetup()).colorList)
    r2(<Toasts />)
    await learnAndTell([{ name: 'Mint', hex: '#8fd09a' }, { name: 'Seafoam', hex: '#7fd8c0' }])
    expect(await s2.findByText(/Learned for your colors: Mint\. Add to your colors\?/)).toBeInTheDocument()
    await userEvent.click(s2.getByRole('button', { name: '+ Seafoam' }))
    await waitFor(async () => expect((await getSetup()).colorList?.map((e) => e.name)).toContain('Seafoam'))
  })
})
