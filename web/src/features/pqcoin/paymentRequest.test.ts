import { describe, expect, it } from 'vitest'
import { readPaymentRequest } from './paymentRequest'
import { paymentLink, type Network } from './api'

const chain = 'ab'.repeat(32), recipient = 'cd'.repeat(32)
const network = { chainId: chain } as Network
const link = paymentLink(recipient, '9007199254740993', chain, 'https://recipient.example/send')
describe('QCash payment request import', () => {
  it('extracts exact units from another portal without navigating or fetching it', () => {
    expect(readPaymentRequest(link, network)).toEqual({ recipient, amount: '9007199254740993' })
    expect(readPaymentRequest(link.replace('currency=QCash', 'currency=PQT'), network).recipient).toBe(recipient)
    expect(readPaymentRequest(link.replace('&amount=9007199254740993', ''), network).amount).toBeNull()
  })
  it('rejects wrong networks, other currencies, ambiguous fields and unsafe URLs', () => {
    for (const invalid of [link.replace(chain, 'ef'.repeat(32)), link.replace('currency=QCash', 'currency=DEM'), link + '&to=' + recipient,
      link + '&amount=1', link.replace('&chain=' + chain, ''), link.replace('&to=' + recipient, ''), link.replace('https:', 'javascript:'),
      link.replace('https://', 'https://user:password@'), link + '#fragment', 'not a link', 'x'.repeat(4097)]) {
      expect(() => readPaymentRequest(invalid, network)).toThrow()
    }
  })
  it('rejects zero, fractional, overflow and noncanonical amounts without changing the form', () => {
    for (const amount of ['0', '1.5', '01', '-2', '1e3', '18446744073709551616', '']) {
      expect(() => readPaymentRequest(link.replace('9007199254740993', amount), network)).toThrow()
    }
  })
})
