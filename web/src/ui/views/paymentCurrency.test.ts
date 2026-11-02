import { describe, expect, it } from 'vitest'
import { paymentCurrency } from './paymentCurrency'
describe('payment currency selection', () => {
  it('preserves legacy Dena links without inferring a different asset', () => {
    expect(paymentCurrency(new URLSearchParams('t=acct_1&a=12.50'))).toBe('DEM')
    expect(paymentCurrency(new URLSearchParams('currency=QCash'))).toBe('QCash')
    expect(paymentCurrency(new URLSearchParams('currency=PQT&chain=abcd'))).toBe('QCash')
  })
  it('refuses ambiguous currency and blockchain requests without QCash', () => {
    for (const search of ['currency=DEM&currency=QCash', 'chain=abcd', 'currency=DEM&chain=abcd']) expect(paymentCurrency(new URLSearchParams(search))).toBe('unsupported')
    expect(paymentCurrency(new URLSearchParams('currency=UNKNOWN'))).toBe('UNKNOWN')
  })
})
