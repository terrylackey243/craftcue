import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { averageAt, ColorSwatch, toHex } from '../../src/components/ColorPick'
import { db } from '../../src/db'
import { cleanColors, saveAssortment } from '../../src/lib/assortment'
import { supplyHex } from '../../src/lib/colorGuess'
import { closestSupplies } from '../../src/lib/import/materials'
import type { Supply } from '../../src/types'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})
afterEach(() => {
  delete (window as { EyeDropper?: unknown }).EyeDropper
})

describe('picked colors', () => {
  it('averages a patch of pixels (paper texture) and normalizes hex', () => {
    // 3 × 1 image: red, a darker red speck, red.
    const data = new Uint8ClampedArray([200, 0, 0, 255, 170, 0, 0, 255, 200, 0, 0, 255])
    expect(averageAt(data, 3, 1, 1, 0, 1)).toBe('#be0000')
    expect(toHex('rgb(1, 2, 255)')).toBe('#0102ff')
    expect(toHex('#ABC')).toBe('#aabbcc')
  })

  it('keeps picked colors through saving a pack, and prefers them over name guesses', async () => {
    expect(cleanColors([{ color: 'Red', count: 1, hex: '#c00000' }, { color: 'red', count: 2 }])).toEqual([{ color: 'Red', count: 3, hex: '#c00000' }])
    const saved = await saveAssortment({ base: { name: 'Cardstock', category: 'cardstock-paper', unit: 'sheet', source: 'manual' }, setName: 'Brights', colors: [{ color: 'Lunar Blue', count: 2, hex: '#3aa0e0' }, { color: 'Gamma Green', count: 2 }], packs: 1 })
    expect(saved[0].colorHex).toBe('#3aa0e0')
    expect(saved[1].colorHex).toBeUndefined()
    expect(supplyHex(saved[0])).toBe('#3aa0e0')
    // "Mystery" can't be guessed from its name, but its picked swatch matches a teal in a file.
    const mystery = { ...saved[1], id: 'm', color: 'Mystery', colorHex: '#1b8a8a' } as Supply
    expect(closestSupplies('#1a8888', [saved[0], mystery])[0].supply.id).toBe('m')
  })

  it('uses Chrome’s screen eyedropper when there is one', async () => {
    ;(window as { EyeDropper?: unknown }).EyeDropper = class {
      open = async () => ({ sRGBHex: '#123abc' })
    }
    const onChange = vi.fn()
    render(<ColorSwatch label="Rocket Red" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pick the color for Rocket Red' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('#123abc'))
  })

  it('otherwise opens the photo / color wheel picker', async () => {
    const onChange = vi.fn()
    render(<ColorSwatch label="Rocket Red" value="#ff0000" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Color for Rocket Red: #ff0000/ }))
    expect(screen.getByText('Choose a photo of the material', { exact: false })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Or choose from the color wheel'), { target: { value: '#00ff00' } })
    expect(onChange).toHaveBeenCalledWith('#00ff00')
    await userEvent.click(screen.getByText('Remove the color'))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })
})
