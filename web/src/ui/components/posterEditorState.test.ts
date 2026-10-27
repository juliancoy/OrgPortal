import { describe, it, expect } from 'vitest'
import { defaults, parseSettings } from './posterEditorState'
describe('poster local preferences', () => {
  it('starts with a designed background and no description',()=>{expect(defaults.background).toBe('gradient');expect(defaults.elements.description?.hidden).toBe(true)})
  it('restores animation preferences without changing older saved posters', () => {
    const legacy = parseSettings(JSON.stringify({version:1,background:'gallery',zoom:1.5}))
    expect(legacy.animation).toBe('none'); expect(legacy.zoom).toBe(1.5)
    const animated = parseSettings(JSON.stringify({version:1,animation:'slow-zoom',animationDuration:35,animationZoom:20}))
    expect(animated.animation).toBe('slow-zoom'); expect(animated.animationDuration).toBe(35); expect(animated.animationZoom).toBe(20)
    const invalid = parseSettings(JSON.stringify({version:1,animation:'evil',animationDuration:-1,animationZoom:900}))
    expect(invalid.animation).toBe('none'); expect(invalid.animationDuration).toBe(8); expect(invalid.animationZoom).toBe(30)
  })
  it('restores all controls including hidden elements and selected image', () => {
    const value = { ...defaults, includeEvents: true, format: 'social', background: 'gallery', mediaId: 'org-photo', zoom: .5, edgeBlur: true, imageFit: 'contain', offsetX: 40, offsetY: -20, opacity: .37, theme: 'dark', selectedElement: 'qr', elements: { ...defaults.elements, time: { hidden: true, shadow: true, shadowOpacity: .9, shadowBlur: 5, shadowDistance: 10, shadowSpread: 3, text: '456 Harbor Road', scale: .5, x: 10, y: -10 } } }
    expect(parseSettings(JSON.stringify({ version: 1, ...value }))).toEqual(value)
  })
  it('bounds and filters corrupt or old stored settings', () => {
    for (const raw of [null, 'bad json', 'null', '{"version":2}']) expect(parseSettings(raw)).toEqual(defaults)
    const value = parseSettings(JSON.stringify({ version: 1, includeEvents: 'true', opacity: -1, zoom: 20, offsetX: '5', selectedElement: '__proto__', elements: { ...defaults.elements, time: { hidden: 'false', scale: 99, shadowOpacity: 5, shadowBlur: -3, shadowDistance: 99, shadowSpread: 99 }, script: { hidden: true } } }))
    expect(value.includeEvents).toBe(false)
    expect(value.opacity).toBe(0); expect(value.zoom).toBe(3); expect(value.offsetX).toBe(0)
    expect(value.selectedElement).toBeNull(); expect(value.elements).toEqual({ ...defaults.elements, time: { hidden: false, shadow: false, shadowOpacity: 1, shadowBlur: 0, shadowDistance: 30, shadowSpread: 12, scale: 3, x: 0, y: 0 } })
  })
})
