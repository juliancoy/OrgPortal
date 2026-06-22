import { describe, expect, it } from 'vitest'
import { clamp, resampleHistory, toFiniteNumber } from './economicOpsUtils'

describe('economicOpsUtils', () => {
  it('clamps values to the requested range', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(4, 0, 10)).toBe(4)
    expect(clamp(12, 0, 10)).toBe(10)
  })

  it('coerces finite values and falls back for invalid values', () => {
    expect(toFiniteNumber('12.5')).toBe(12.5)
    expect(toFiniteNumber(Number.NaN, 7)).toBe(7)
    expect(toFiniteNumber('not-a-number', 3)).toBe(3)
  })

  it('resamples long money supply histories while preserving endpoints', () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      timestamp: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      total_supply: index * 10,
    }))

    const sampled = resampleHistory(points, 4)

    expect(sampled).toHaveLength(4)
    expect(sampled[0]).toEqual(points[0])
    expect(sampled[3].timestamp).toBe(points[9].timestamp)
    expect(sampled[3].total_supply).toBe(90)
    expect(sampled[1].total_supply).toBeGreaterThan(sampled[0].total_supply)
    expect(sampled[2].total_supply).toBeGreaterThan(sampled[1].total_supply)
  })
})
