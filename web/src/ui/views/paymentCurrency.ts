import { useSearchParams } from 'react-router-dom'
export function paymentCurrency(search: URLSearchParams): string {
  if (search.get('currency') === 'PQT' && search.getAll('currency').length === 1) return 'QCash'
  if (search.getAll('currency').length > 1 || (search.has('chain') && search.get('currency') !== 'QCash')) return 'unsupported'
  return search.get('currency') || 'DEM'
}
export function usePaymentCurrency() {
  const [params, setParams] = useSearchParams()
  return { currency: paymentCurrency(params), search: params.toString(), selectCurrency: (currency: string) => setParams({ currency }, { replace: true }) }
}
