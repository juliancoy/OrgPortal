import { describe, expect, it } from 'vitest'
import {
  adultPopulationAtOrAboveAge,
  benefitFactorForAge,
  estimateLifeInsuranceDisbursement,
  globalPopulationAgeBands,
} from './lifeInsuranceModel'

describe('life insurance age-equity model', () => {
  it('gives the youngest eligible member the full standard benefit', () => {
    const estimate = estimateLifeInsuranceDisbursement(18, 100_000)
    expect(estimate.benefitFactor).toBeCloseTo(1)
    expect(estimate.disbursement).toBeCloseTo(100_000)
    expect(estimate.adultPopulationAtOrAboveAge).toBeCloseTo(1)
  })

  it('decreases smoothly with age while retaining the benefit floor', () => {
    const factors = [18, 30, 50, 70, 90, 100].map(benefitFactorForAge)
    expect(factors).toEqual([...factors].sort((a, b) => b - a))
    expect(factors.every((factor) => factor >= 0.5 && factor <= 1)).toBe(true)
  })

  it('uses only age and the program standard benefit', () => {
    expect(estimateLifeInsuranceDisbursement(45, 80_000)).toEqual(
      estimateLifeInsuranceDisbursement(45, 80_000),
    )
  })

  it('rejects ages outside the adult member range', () => {
    expect(() => adultPopulationAtOrAboveAge(17)).toThrow('18 to 100')
    expect(() => adultPopulationAtOrAboveAge(101)).toThrow('18 to 100')
    expect(() => adultPopulationAtOrAboveAge(35.5)).toThrow('whole number')
  })

  it('builds a complete global population pyramid', () => {
    const bands = globalPopulationAgeBands()
    expect(bands).toHaveLength(21)
    expect(bands[0]).toMatchObject({ label: '0\u20134', startAge: 0, endAge: 4 })
    expect(bands[20]).toMatchObject({ label: '100+', startAge: 100, endAge: 100 })
    expect(bands.reduce((sum, band) => sum + band.populationPercent, 0)).toBeCloseTo(100, 0)
  })
})
