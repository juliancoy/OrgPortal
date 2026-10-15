import { describe, it, expect } from 'vitest'
import { defaults, parseSettings } from './posterEditorState'
describe('poster local preferences', () => {
  it('restores all controls including hidden elements and selected image', () => {
    const value = { ...defaults, format: 'social', background: 'gallery', mediaId: 'org-photo', zoom: .5, edgeBlur: true, imageFit: 'contain', offsetX: 40, offsetY: -20, opacity: .37, theme: 'dark', selectedElement: 'qr', elements: { time: { hidden: true, scale: .5, x: 10, y: -10 } } }
    expect(parseSettings(JSON.stringify({ version: 1, ...value }))).toEqual(value)
  })
  it('bounds and filters corrupt or old stored settings', () => {
    for (const raw of [null, 'bad json', 'null', '{"version":2}']) expect(parseSettings(raw)).toEqual(defaults)
    const value = parseSettings(JSON.stringify({ version: 1, opacity: -1, zoom: 20, offsetX: '5', selectedElement: '__proto__', elements: { time: { hidden: 'false', scale: 99 }, script: { hidden: true } } }))
    expect(value.opacity).toBe(0); expect(value.zoom).toBe(3); expect(value.offsetX).toBe(0)
    expect(value.selectedElement).toBe('time'); expect(value.elements).toEqual({ time: { hidden: false, scale: 3, x: 0, y: 0 } })
  })
})
