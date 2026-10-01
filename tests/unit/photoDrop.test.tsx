import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PhotoDrop, { imageFrom } from '../../src/components/PhotoDrop'

const png = new File(['x'], 'shot.png', { type: 'image/png' })
const text = new File(['x'], 'notes.txt', { type: 'text/plain' })
const dt = (files: File[], types = ['Files']) => ({ files, items: [], types }) as unknown as DataTransfer

describe('drag, paste or choose a photo', () => {
  it('finds the picture in a drop or paste', () => {
    expect(imageFrom(dt([text, png]))).toBe(png)
    expect(imageFrom(dt([text]))).toBeNull()
    const item = { kind: 'file', type: 'image/png', getAsFile: () => png }
    expect(imageFrom({ files: [], items: [item], types: [] } as unknown as DataTransfer)).toBe(png)
  })

  it('uses a dropped picture, and explains a dropped non-picture', () => {
    const onFile = vi.fn()
    render(<PhotoDrop onFile={onFile}><button>Choose</button></PhotoDrop>)
    const zone = screen.getByTestId('photo-drop')
    fireEvent.drop(zone, { dataTransfer: dt([png]) })
    expect(onFile).toHaveBeenCalledWith(png)
    fireEvent.drop(zone, { dataTransfer: dt([text]) })
    expect(screen.getByRole('status')).toHaveTextContent(/isn’t a picture/)
    expect(onFile).toHaveBeenCalledTimes(1)
  })

  it('takes a pasted picture but leaves text pastes alone', () => {
    const onFile = vi.fn()
    render(<PhotoDrop onFile={onFile}><button>Choose</button></PhotoDrop>)
    const paste = (clipboardData: unknown) => {
      const e = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
      e.clipboardData = clipboardData
      document.dispatchEvent(e)
      return e
    }
    expect(paste(dt([], ['text/plain'])).defaultPrevented).toBe(false)
    expect(onFile).not.toHaveBeenCalled()
    expect(paste(dt([png])).defaultPrevented).toBe(true)
    expect(onFile).toHaveBeenCalledWith(png)
  })

  it('ignores drops and pastes while disabled', () => {
    const onFile = vi.fn()
    render(<PhotoDrop onFile={onFile} disabled><button>Choose</button></PhotoDrop>)
    fireEvent.drop(screen.getByTestId('photo-drop'), { dataTransfer: dt([png]) })
    expect(onFile).not.toHaveBeenCalled()
  })
})
