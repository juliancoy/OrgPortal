import { describe, expect, it } from 'vitest'
import { createQrSvg } from './qr'

describe('createQrSvg', () => {
  it('generates a real QR SVG for a profile URL', () => {
    const svg = createQrSvg('https://codecollective.us/p/users/julian', 7, 3)

    expect(svg).toContain('<svg')
    expect(svg).toContain('aria-label="QR code"')
    expect(svg).toContain('<rect')
    expect(svg).toContain('<title>https://codecollective.us/p/users/julian</title>')
  })
})
