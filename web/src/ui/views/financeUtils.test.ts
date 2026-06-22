import { describe, expect, it } from 'vitest'
import {
  buildPaymentRequestUrl,
  incomingTransactions,
  parsePaymentRequestSearch,
  recipientOptions,
  type FinanceTransaction,
} from './financeUtils'

describe('financeUtils', () => {
  it('parses full and compact payment request query parameters', () => {
    expect(parsePaymentRequestSearch('?to=acct_1&amount=12.50&memo=Invoice&from=Julian')).toEqual({
      toAccountId: 'acct_1',
      amount: '12.50',
      memo: 'Invoice',
      requestSource: 'Julian',
    })

    expect(parsePaymentRequestSearch('t=acct_2&a=7&m=Coffee&f=Code%20Collective')).toEqual({
      toAccountId: 'acct_2',
      amount: '7',
      memo: 'Coffee',
      requestSource: 'Code Collective',
    })
  })

  it('builds compact payment request links with a safe zero fallback amount', () => {
    expect(buildPaymentRequestUrl('acct_1', '12.50', 'https://codecollective.us/send')).toBe(
      'https://codecollective.us/send?t=acct_1&a=12.50',
    )
    expect(buildPaymentRequestUrl('acct_1', '', 'https://codecollective.us/send')).toBe(
      'https://codecollective.us/send?t=acct_1&a=0',
    )
  })

  it('excludes the current account from send recipients', () => {
    const accounts = [
      { id: 'me', name: 'Me', email: 'me@example.com' },
      { id: 'them', name: 'Them', email: 'them@example.com' },
    ]

    expect(recipientOptions(accounts, { id: 'me' })).toEqual([accounts[1]])
    expect(recipientOptions(accounts, null)).toEqual(accounts)
  })

  it('filters incoming transactions by destination account and limit', () => {
    const transactions: FinanceTransaction[] = Array.from({ length: 12 }, (_, index) => ({
      id: `tx_${index}`,
      to_account_id: index === 2 ? 'other' : 'me',
      amount: index + 1,
      transaction_type: 'purchase',
      description: 'Transfer',
      timestamp: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }))

    const incoming = incomingTransactions(transactions, 'me', 5)

    expect(incoming).toHaveLength(5)
    expect(incoming.every((tx) => tx.to_account_id === 'me')).toBe(true)
    expect(incoming.map((tx) => tx.id)).toEqual(['tx_0', 'tx_1', 'tx_3', 'tx_4', 'tx_5'])
  })
})
