import { describe, expect, it } from 'vitest'
import { modelNametagPrint } from './modelNametagPrint'

describe('printer fit model', () => {
  it('fits the whole sheet proportionally within 5 mm borders', () => {
    const m = modelNametagPrint(5)
    expect(m.scale).toBeCloseTo(91.6 / 101.6)
    expect(m.cardWidth).toBeCloseTo(77.174803)
    expect(m.cardHeight).toBeCloseTo(48.667008)
    expect(m.sheetX).toBeCloseTo(5)
    expect(m.sheetY).toBeCloseTo(7.5)
    expect(m.cardWidth / m.cardHeight).toBeCloseTo(85.6 / 53.98)
    expect(m.cardY + m.cardStep + m.cardHeight).toBeLessThan(152.4 - 5)
  })
  it('preserves the original size with no border and shrinks with larger borders', () => {
    expect(modelNametagPrint(0).cardWidth).toBe(85.6)
    expect(modelNametagPrint(0).cardHeight).toBe(53.98)
    expect(modelNametagPrint(10).scale).toBeLessThan(modelNametagPrint(5).scale)
  })
  it('rejects impossible and nonnumeric borders', () => {
    for (const border of [-1, 26, NaN, Infinity]) expect(() => modelNametagPrint(border)).toThrow(RangeError)
  })
})
