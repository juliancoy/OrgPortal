import { portalUrl } from '../../config/portalBase'

export type FinanceAccountSummary = {
  id: string
  name: string
  email: string
}

export type FinanceTransaction = {
  id: string
  from_account_id?: string | null
  to_account_id?: string | null
  amount: number
  transaction_type: string
  description: string
  timestamp: string
}

export type ParsedPaymentRequest = {
  toAccountId: string
  amount: string
  memo: string
  requestSource: string
}

export function parsePaymentRequestSearch(search: string): ParsedPaymentRequest {
  const normalizedSearch = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(normalizedSearch)
  return {
    toAccountId: params.get('to') ?? params.get('t') ?? '',
    amount: params.get('amount') ?? params.get('a') ?? '',
    memo: params.get('memo') ?? params.get('m') ?? '',
    requestSource: params.get('from') ?? params.get('f') ?? '',
  }
}

export function recipientOptions<T extends { id: string }>(accounts: T[], me?: { id: string } | null): T[] {
  if (!me) return accounts
  return accounts.filter((account) => account.id !== me.id)
}

export function buildPaymentRequestUrl(accountId: string, amount: string, sendUrl = portalUrl('/send')): string {
  const params = new URLSearchParams({
    t: accountId,
    a: amount || '0',
  })
  return `${sendUrl}?${params.toString()}`
}

export function incomingTransactions<T extends { to_account_id?: string | null }>(
  transactions: T[],
  accountId: string,
  limit = 10,
): T[] {
  return transactions.filter((tx) => tx.to_account_id === accountId).slice(0, limit)
}
