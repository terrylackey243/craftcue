// SVG for Cricut Design Space (and other cutter software): real inch sizes, one group per
// material so each becomes its own layer, score/draw lines kept as separate stroked groups.
import { linesToPathD, shapeToPathD, UNITS_PER_IN } from './geometry'
import type { RenderedDesign } from './render'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function exportSvg(r: RenderedDesign, title: string): string {
  const w = r.widthIn * UNITS_PER_IN
  const h = r.heightIn * UNITS_PER_IN
  const groups = r.layers
    .filter((l) => l.shape.length || l.lines.length)
    .map((l) => {
      const id = esc(`${l.name}${l.operation === 'score' ? ' (score)' : l.operation === 'draw' ? ' (draw)' : ''}`)
      if (l.operation === 'score' || l.operation === 'draw') {
        return `<g id="${id}" fill="none" stroke="${esc(l.color)}" stroke-width="20" stroke-linecap="round"><path d="${linesToPathD(l.lines)}"/></g>`
      }
      return `<g id="${id}" fill="${esc(l.color)}"><path fill-rule="nonzero" d="${shapeToPathD(l.shape)}"/></g>`
    })
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r.widthIn}in" height="${r.heightIn}in" viewBox="0 0 ${w} ${h}">`,
    `<title>${esc(title)}</title>`,
    ...groups,
    `</svg>`,
  ].join('\n')
}

export function svgFilename(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'design'
  return `craftcue-${slug}.svg`
}

export function downloadText(text: string, filename: string, type = 'image/svg+xml') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
