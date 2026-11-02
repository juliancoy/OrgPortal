import { Link } from 'react-router-dom'
import { usePaymentCurrency } from './paymentCurrency'
import { PqcoinPayment } from '../../features/pqcoin/PqcoinPayment'
import { SignInLink } from '../components/SignInLink'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/AppProviders'
import { Header } from '../shell/Header'
import { Footer } from '../shell/Footer'
import {
  parsePaymentRequestSearch,
  recipientOptions as buildRecipientOptions,
  type FinanceAccountSummary,
} from './financeUtils'

const ORG_API_BASE = '/api/org'

type AccountSummary = FinanceAccountSummary

type MeAccount = {
  id: string
  name: string
  email: string
  balance: number
}

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

async function orgFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(orgUrl(path), options)
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(text || `Request failed (${resp.status})`)
  }
  return (await resp.json()) as T
}

export function SendPage() {
  const { currency, search, selectCurrency } = usePaymentCurrency()
  const { token } = useAuth()
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [me, setMe] = useState<MeAccount | null>(null)
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('1.00')
  const [description, setDescription] = useState('Transfer')
  const [requestSource, setRequestSource] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (currency !== 'DEM') return
    const request = parsePaymentRequestSearch(search)
    setToAccountId(request.toAccountId)
    setAmount(request.amount || '1.00')
    setDescription(request.memo || 'Transfer')
    setRequestSource(request.requestSource)
  }, [search, currency])

  useEffect(() => {
    if (!token || currency !== 'DEM') return
    const headers = { Authorization: `Bearer ${token}` }
    Promise.allSettled([
      orgFetch<MeAccount>('/api/accounts/me', { headers }),
      orgFetch<AccountSummary[]>('/api/accounts?limit=2000&sort=name_asc', { headers }),
    ]).then(([meResult, accountsResult]) => {
      if (meResult.status === 'fulfilled') {
        setMe(meResult.value)
      }
      if (accountsResult.status === 'fulfilled') {
        setAccounts(Array.isArray(accountsResult.value) ? accountsResult.value : [])
      }
    })
  }, [token, currency])

  const recipientOptions = useMemo(() => {
    return buildRecipientOptions(accounts, me)
  }, [accounts, me])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) {
      setStatus('Sign in required.')
      return
    }
    if (!toAccountId) {
      setStatus('Select a recipient.')
      return
    }
    setIsSubmitting(true)
    setStatus('')
    try {
      await orgFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to_account_id: toAccountId,
          amount: Number(amount),
          transaction_type: 'purchase',
          description: description || 'Transfer',
        }),
      })
      setStatus('Transaction sent.')
      const refreshed = await orgFetch<MeAccount>('/api/accounts/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setMe(refreshed)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to send transaction')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="portal-shell">
      <Header />
      <main className="portal-main">
        <div className={`portal-container ${currency === 'QCash' ? 'qcash-page' : ''}`}>
          <div className="payment-currency-picker">{currency === 'QCash' && <Link to="/finance" className="qc-back">← Finance</Link>}<label htmlFor="payment-currency">Currency</label><select id="payment-currency" style={{ width: '100%', maxWidth: '100%' }} value={currency} onChange={event => {
            const selected = event.target.value
            setToAccountId(''); setAmount('1.00'); setDescription('Transfer'); setRequestSource(''); setStatus('')
            selectCurrency(selected)
          }}>
            <option value="DEM">Dena (DEM)</option><option value="QCash">QCash Beta · Experimental</option>
            {!['DEM', 'QCash'].includes(currency) && <option value={currency}>Unsupported currency</option>}
          </select></div>
          {currency === 'QCash' ? <PqcoinPayment key={search} mode="send" /> : currency === 'DEM' ? <>
          <section className="portal-hero">
            <div>
              <span className="portal-pill">Payments</span>
              <h1>Send Dena</h1>
              <p className="portal-muted">Create a transfer to another account.</p>
              {requestSource && <p className="portal-muted">Payment request from: {requestSource}</p>}
            </div>
            <div className="portal-card">
              <div className="portal-muted">Your balance</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>
                {me ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(me.balance)} DEM` : '—'}
              </div>
              <div className="portal-muted">{me?.email ?? ''}</div>
            </div>
          </section>

          <section className="portal-section">
            <form className="portal-card portal-form" onSubmit={onSubmit}>
              <label>
                Recipient
                <select value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} required>
                  <option value="">Select account</option>
                  {recipientOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.email})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount (DEM)
                <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
              </label>
              <label>
                Description
                <input value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send'}
              </button>
              {status && <p className="portal-muted">{status === 'Sign in required.' ? <><SignInLink /> to continue.</> : status}</p>}
            </form>
          </section>
          </> : <p role="alert">Unsupported payment currency. Select a supported currency to continue.</p>}
        </div>
      </main>
      <Footer />
    </div>
  )
}
