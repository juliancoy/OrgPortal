import { useAuth } from '../../app/AppProviders'
import {
  ProfileWallet,
  ProfileRecipientPicker,
  profileFetch,
} from './ProfileWallet'
import { verifyWalletRecipient, type WalletRecipient } from './wallet'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { portalUrl } from '../../config/portalBase'
import { createQrSvg } from '../../ui/utils/qr'
import {
  paymentLink,
  pqcoinFetch,
  validateRequest,
  type Account,
  type Network,
} from './api'
import {
  createWallet,
  exportWallet,
  importWallet,
  lockWallet,
  signTransfer,
  units,
} from './wallet'
import { useWallet } from './WalletBoundary'
import { readPaymentQr, readPaymentRequest } from './paymentRequest'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileKey2,
  LockKeyhole,
  Wallet,
  History,
} from 'lucide-react'
import './wallet.css'

export function PqcoinPayment({ mode }: { mode: 'send' | 'receive' }) {
  const { wallet, setWallet } = useWallet()
  const { token } = useAuth()
  const [person, setPerson] = useState<WalletRecipient | null>(null)
  const networkId = useRef('')
  const [network, setNetwork] = useState<Network | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState('')
  const [password, setPassword] = useState('')
  const [accessMode, setAccessMode] = useState<'create' | 'unlock'>('create')
  const [busy, setBusy] = useState(false)
  const [recipient, setRecipient] = useState(
    () => new URLSearchParams(location.search).get('to') || '',
  )
  const [amount, setAmount] = useState(
    () => new URLSearchParams(location.search).get('amount') || '10',
  )
  const [fee, setFee] = useState('0')
  const [review, setReview] = useState(false)
  const [lastSigned, setLastSigned] = useState<{
    signedTransfer: string
    id: string
    chain: string
  } | null>(null)
  const [receipt, setReceipt] = useState('')
  const [request, setRequest] = useState('')
  const [backupVerified, setBackupVerified] = useState(false)
  const [submitted, setSubmitted] = useState<{
    recipient: string
    amount: string
    fee: string
    chain: string
  } | null>(null)
  const importGeneration = useRef(0)
  useEffect(
    () => () => {
      importGeneration.current++
    },
    [],
  )
  useEffect(() => {
    setBackupVerified(false)
  }, [wallet])

  useEffect(() => {
    let active = true,
      pending = false
    setAccount(null)
    setReview(false)
    setReceipt('')
    setLastSigned(null)
    setSubmitted(null)
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const n = await pqcoinFetch<Network>('/network')
        if (
          n.currency !== 'QCash' ||
          n.decimals !== 0 ||
          !n.experimental ||
          !/^[0-9a-f]{64}$/.test(n.chainId)
        )
          throw new Error('Unsupported testnet configuration.')
        const a = wallet
          ? await pqcoinFetch<Account>(`/accounts/${wallet.address}`)
          : null
        if (a) {
          units(a.spendable, true)
          units(a.immature, true)
          units(a.nonce, true)
          if (a.address !== wallet?.address)
            throw new Error('Wallet response mismatch.')
        }
        if (active) {
          if (networkId.current && networkId.current !== n.chainId) {
            setReview(false)
            setLastSigned(null)
            setStatus('Network changed. Review the payment again.')
          }
          networkId.current = n.chainId
          setNetwork(n)
          setAccount(a)
          setLoadError('')
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'Testnet unavailable.',
          )
          setReview(false)
        }
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [wallet])

  const requestError = network ? validateRequest(location.search, network) : ''
  const pending = !!account?.transactions.some(
    (tx) => tx.sender === wallet?.address && tx.status === 'pending',
  )
  const link = useMemo(() => {
    if (!wallet || !network) return ''
    try {
      units(amount)
      return paymentLink(
        wallet.address,
        amount,
        network.chainId,
        portalUrl('/send'),
      )
    } catch {
      return ''
    }
  }, [wallet, network, amount])
  const qr = useMemo(() => {
    try {
      return link ? createQrSvg(link, 6, 4) : ''
    } catch {
      return ''
    }
  }, [link])

  async function create() {
    setBusy(true)
    setStatus('')
    let value: ReturnType<typeof createWallet> | null = null
    try {
      value = createWallet()
      const backup = await exportWallet(value, password)
      const url = URL.createObjectURL(
        new Blob([backup], { type: 'application/json' }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `qcash-testnet-${value.address.slice(0, 12)}.json`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setWallet(value)
      value = null
      setPassword('')
      setStatus(
        'Wallet created. Keep the downloaded backup and its password safe. Verify your backup below before receiving funds.',
      )
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Unable to create wallet.',
      )
    } finally {
      if (value) lockWallet(value)
      setBusy(false)
    }
  }
  async function restore(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setStatus('')
    try {
      if (file.size > 2048) throw new Error('Invalid wallet backup.')
      setWallet(await importWallet(await file.text(), password))
      setPassword('')
      setStatus('Wallet unlocked.')
    } catch {
      setStatus('Unable to unlock backup. Check the file and password.')
    } finally {
      setBusy(false)
    }
  }
  async function verifyBackup(file: File | undefined) {
    if (!file || !wallet) return
    const address = wallet.address
    setBusy(true)
    setStatus('')
    let restored: Awaited<ReturnType<typeof importWallet>> | null = null
    try {
      if (file.size > 2048) throw new Error('Invalid wallet backup.')
      restored = await importWallet(await file.text(), password)
      if (restored.address !== address)
        throw new Error('This backup belongs to a different wallet.')
      setBackupVerified(true)
      setPassword('')
      setStatus('Backup verified. This file and password recover your wallet.')
    } catch (error) {
      setStatus(
        error instanceof Error && error.message.includes('different wallet')
          ? error.message
          : 'Unable to verify backup. Check the file and password.',
      )
    } finally {
      if (restored) lockWallet(restored)
      setBusy(false)
    }
  }
  function applyRequest(value: string) {
    if (!network || loadError || networkId.current !== network.chainId)
      throw new Error('Connect to the testnet before importing a request.')
    const details = readPaymentRequest(value, network)
    setRecipient(details.recipient)
    setPerson(null)
    if (details.amount !== null) setAmount(details.amount)
    setReview(false)
    setRequest('')
    setStatus(
      'Payment request loaded. Check the recipient and amount before sending.',
    )
  }
  async function importQr(file: File | undefined) {
    if (!file) return
    const generation = ++importGeneration.current
    setBusy(true)
    try {
      const value = await readPaymentQr(file)
      if (generation === importGeneration.current) applyRequest(value)
    } catch (error) {
      if (generation === importGeneration.current)
        setStatus(
          error instanceof Error ? error.message : 'Unable to read QR image.',
        )
    } finally {
      if (generation === importGeneration.current) setBusy(false)
    }
  }
  function checkPayment() {
    if (!wallet || !account || !network || loadError || requestError)
      throw new Error(
        'Connect to the correct testnet and unlock your wallet first.',
      )
    if (!/^[0-9a-f]{64}$/.test(recipient) || recipient === wallet.address)
      throw new Error('Enter a different valid QCash wallet address.')
    if (units(amount) + units(fee, true) > units(account.spendable, true))
      throw new Error('Insufficient spendable QCash.')
    if (pending)
      throw new Error('Wait for your pending transfer before sending another.')
  }
  async function checkRecipient() {
    if (!person) return
    if (!token || !network)
      throw new Error('Sign in again and choose the recipient.')
    const current = await profileFetch<WalletRecipient>(
      token,
      '/recipients/' + encodeURIComponent(person.userId),
    )
    verifyWalletRecipient(current, location.origin, network.chainId)
    if (
      current.userId !== person.userId ||
      current.address !== recipient ||
      current.revision !== person.revision
    )
      throw new Error(
        'Recipient wallet link changed. Choose the recipient and review the payment again.',
      )
  }
  async function reviewPayment(event: FormEvent) {
    event.preventDefault()
    setStatus('')
    try {
      checkPayment()
      await checkRecipient()
      setReview(true)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Invalid payment.')
    }
  }
  async function broadcast(signed: {
    signedTransfer: string
    id: string
    chain: string
  }) {
    if (
      !network ||
      signed.chain !== network.chainId ||
      requestError ||
      loadError
    )
      throw new Error('Network unavailable or changed. Submission stopped.')
    const result = await pqcoinFetch<{ id: string; status: string }>(
      '/transactions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransfer: signed.signedTransfer }),
      },
    )
    if (result.id !== signed.id)
      throw new Error('Node returned a different transaction ID.')
    setReceipt(signed.id)
    setLastSigned(null)
    setStatus('Transfer submitted. Waiting for the chain to confirm it.')
    setReview(false)
  }
  async function send() {
    setBusy(true)
    try {
      checkPayment()
      await checkRecipient()
      const signed = {
        ...signTransfer(
          wallet!,
          network!.chainId,
          recipient,
          amount,
          fee,
          account!.nonce,
        ),
        chain: network!.chainId,
      }
      setSubmitted({ recipient, amount, fee, chain: network!.chainId })
      setLastSigned(signed)
      setReceipt(signed.id)
      await broadcast(signed)
    } catch (error) {
      setStatus(
        `${error instanceof Error ? error.message : 'Submission failed.'} If submission is uncertain, retry the same signed transfer below.`,
      )
    } finally {
      setBusy(false)
      setReview(false)
    }
  }
  async function retry() {
    if (!lastSigned) return
    setBusy(true)
    try {
      await broadcast(lastSigned)
    } catch {
      setStatus(
        'Submission remains uncertain. Check the transaction or retry the same transfer.',
      )
    } finally {
      setBusy(false)
    }
  }
  const observed = account?.transactions.find((tx) => tx.id === receipt)
  const receiptState = loadError
    ? 'Status unavailable — reconnecting'
    : observed?.status === 'confirmed'
      ? `Confirmed · ${observed.confirmations} confirmation${observed.confirmations === 1 ? '' : 's'}`
      : observed?.status === 'pending'
        ? 'Pending confirmation'
        : 'Not currently observed — check again before sending another payment'
  function downloadReceipt() {
    if (!submitted || !receipt) return
    const data = {
      currency: 'QCash',
      network: submitted.chain,
      transactionId: receipt,
      sender: wallet?.address,
      recipient: submitted.recipient,
      amount: submitted.amount,
      fee: submitted.fee,
      status: loadError ? 'unavailable' : observed?.status || 'unknown',
      confirmations: loadError ? null : (observed?.confirmations ?? 0),
      observedAt: new Date().toISOString(),
      experimental: true,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `qcash-receipt-${receipt.slice(0, 12)}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section
      className="qcash-wallet"
      aria-label="QCash testnet wallet"
      aria-busy={busy}
    >
      <header className="qc-header">
        <div className="qc-title">
          <span className="qc-mark" aria-hidden="true">
            Q
          </span>
          <div>
            <span className="qc-eyebrow">
              YOUR EVERYDAY WALLET <span className="qc-beta">BETA</span>
            </span>
            <h1>{mode === 'send' ? 'Send' : 'Receive'} QCash Beta</h1>
            <p>
              {wallet
                ? mode === 'send'
                  ? 'Choose a recipient, review the details, and send.'
                  : 'Share a payment request to receive QCash.'
                : 'Start with your wallet. Your next payment is a few steps away.'}
            </p>
          </div>
        </div>
        <nav className="qc-navigation" aria-label="QCash payments">
          <Link
            to="/send?currency=QCash"
            aria-current={mode === 'send' ? 'page' : undefined}
          >
            <ArrowUpRight aria-hidden="true" />
            Send QCash
          </Link>
          <Link
            to="/receive?currency=QCash"
            aria-current={mode === 'receive' ? 'page' : undefined}
          >
            <ArrowDownLeft aria-hidden="true" />
            Receive QCash
          </Link>
        </nav>
      </header>
      {loadError && (
        <p role="alert" className="qc-alert">
          {loadError}
        </p>
      )}
      {requestError && (
        <p role="alert" className="qc-alert">
          {requestError}
        </p>
      )}
      {!wallet ? (
        <div className="qc-onboarding">
          <section
            className="qc-panel qc-access portal-form"
            aria-labelledby="qc-access-heading"
          >
            <div className="qc-section-title">
              <span className="qc-icon">
                <Wallet aria-hidden="true" />
              </span>
              <div>
                <span className="qc-eyebrow">STEP 1 · YOUR WALLET</span>
                <h2 id="qc-access-heading">
                  {accessMode === 'create'
                    ? 'A fresh start for your QCash'
                    : 'Welcome back'}
                </h2>
              </div>
            </div>
            <div
              className="qc-access-options"
              role="group"
              aria-label="Wallet access"
            >
              <button
                type="button"
                disabled={busy}
                aria-pressed={accessMode === 'create'}
                onClick={() => {
                  setAccessMode('create')
                  setPassword('')
                  setStatus('')
                }}
              >
                Create a wallet
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={accessMode === 'unlock'}
                onClick={() => {
                  setAccessMode('unlock')
                  setPassword('')
                  setStatus('')
                }}
              >
                Unlock a wallet
              </button>
            </div>
            <p className="qc-description">
              {accessMode === 'create'
                ? 'Choose a password to protect your backup. Your new wallet and encrypted backup are created on this device.'
                : 'Use your saved backup file and its password to open your wallet on this device.'}
            </p>
            <label>
              Backup password
              <input
                type="password"
                minLength={12}
                maxLength={1024}
                autoComplete={
                  accessMode === 'create' ? 'new-password' : 'current-password'
                }
                aria-describedby="qc-password-help"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <p id="qc-password-help" className="qc-help">
              {accessMode === 'create'
                ? 'Use at least 12 characters. Keep this password somewhere safe.'
                : 'Enter the password you chose when creating your backup.'}
            </p>
            {accessMode === 'create' ? (
              <button
                className="qc-primary"
                type="button"
                disabled={busy || password.length < 12}
                onClick={() => {
                  void create()
                }}
              >
                <Download aria-hidden="true" />
                Create wallet and download backup
              </button>
            ) : (
              <label className="qc-backup-file">
                Unlock encrypted wallet backup
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={busy || password.length < 12}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    void restore(file)
                  }}
                />
              </label>
            )}
            <p className="qc-device-note">
              <LockKeyhole aria-hidden="true" />
              Your signing key stays on your device.
            </p>
          </section>
          <aside className="qc-guide" aria-label="Getting started with QCash">
            <span className="qc-eyebrow">SIMPLE TO START</span>
            <h2>
              {mode === 'send'
                ? 'From wallet to payment.'
                : 'Ready to receive.'}
            </h2>
            <p>
              A wallet gives you a personal address for sending and receiving
              QCash.
            </p>
            <ol className="qc-steps">
              <li>
                <span>1</span>
                <div>
                  <strong>Create or unlock your wallet</strong>
                  <p>No portal account needed for wallet payments.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Keep your backup safe</strong>
                  <p>
                    You need both the file and its password to recover your
                    wallet.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>
                    {mode === 'send'
                      ? 'Review, then send'
                      : 'Share your payment request'}
                  </strong>
                  <p>
                    {mode === 'send'
                      ? 'Check the recipient, amount and fee before authorizing.'
                      : 'Send a link or show your QR code to the sender.'}
                  </p>
                </div>
              </li>
            </ol>
            <p className="qc-help">
              Your wallet locks when you leave or hide this tab. Unlock it again
              with your backup.
            </p>
          </aside>
        </div>
      ) : (
        <>
          <div className="qc-payment-layout">
            <aside
              className="qc-panel qc-balance"
              aria-label="Your QCash wallet"
            >
              <span className="qc-eyebrow">AVAILABLE TO SPEND</span>
              <p className="qc-balance-value" data-testid="pqt-spendable">
                {loadError ? '—' : (account?.spendable ?? '—')} QCash
              </p>
              <p className="qc-help">
                Immature mining rewards:{' '}
                {loadError ? '—' : (account?.immature ?? '—')} QCash
              </p>
              {loadError && (
                <p>
                  Balance and payment status are unavailable. Sending is paused
                  until the connection returns.
                </p>
              )}
              <div className="qc-address">
                <strong>Your wallet address</strong>
                <code data-testid="pqt-address">{wallet.address}</code>
              </div>
              <div className="qc-actions">
                <button
                  className="qc-secondary"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(wallet.address).then(
                      () => setStatus('Wallet address copied.'),
                      () =>
                        setStatus(
                          'Unable to copy. Select the wallet address to copy it.',
                        ),
                    )
                  }}
                >
                  <Copy aria-hidden="true" />
                  Copy wallet address
                </button>
                <button
                  className="qc-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setWallet(null)}
                >
                  <LockKeyhole aria-hidden="true" />
                  Lock wallet
                </button>
              </div>
              <details className="qc-disclosure">
                <summary>
                  <FileKey2 aria-hidden="true" />
                  Verify wallet recovery
                </summary>
                <div className="portal-form">
                  <p>
                    Check your backup and password before relying on this
                    wallet. Portal sign-in cannot recover your funds.
                  </p>
                  {backupVerified ? (
                    <p>
                      <Check aria-hidden="true" />
                      Backup verified for this wallet.
                    </p>
                  ) : (
                    <>
                      <label>
                        Recovery password
                        <input
                          type="password"
                          autoComplete="off"
                          maxLength={1024}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </label>
                      <label>
                        Verify downloaded backup
                        <input
                          type="file"
                          accept="application/json,.json"
                          disabled={busy || password.length < 12}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            void verifyBackup(file)
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              </details>
            </aside>
            {mode === 'send' ? (
              <form
                className="qc-panel qc-compose portal-form"
                onSubmit={reviewPayment}
              >
                <div className="qc-section-title">
                  <span className="qc-icon">
                    <ArrowUpRight aria-hidden="true" />
                  </span>
                  <div>
                    <span className="qc-eyebrow">MAKE A PAYMENT</span>
                    <h2>Where should it go?</h2>
                  </div>
                </div>
                <details className="qc-disclosure qc-request-import">
                  <summary>Have a payment link or QR image?</summary>
                  <fieldset
                    disabled={busy || !network || !!loadError || !!lastSigned}
                  >
                    <legend>Use a payment request</legend>
                    <label>
                      QCash payment link
                      <input
                        inputMode="url"
                        value={request}
                        maxLength={4096}
                        onChange={(e) => setRequest(e.target.value)}
                        placeholder="Paste a link from the recipient"
                      />
                    </label>
                    <button
                      className="qc-secondary"
                      type="button"
                      disabled={!request}
                      onClick={() => {
                        try {
                          applyRequest(request)
                        } catch (error) {
                          setStatus(
                            error instanceof Error
                              ? error.message
                              : 'Invalid payment request.',
                          )
                        }
                      }}
                    >
                      Use payment link
                    </button>
                    <label>
                      Scan QR image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          void importQr(file)
                        }}
                      />
                    </label>
                    <p className="qc-help">
                      Choose a saved QR image or screenshot. It is read on your
                      device.
                    </p>
                  </fieldset>
                </details>
                {network && (
                  <ProfileRecipientPicker
                    chainId={network.chainId}
                    onSelect={(value) => {
                      setPerson(value)
                      setRecipient(value.address)
                      setReview(false)
                    }}
                  />
                )}
                {person && (
                  <p>
                    Recipient: {person.name} · {person.profileSlug}
                  </p>
                )}
                <label>
                  Recipient QCash wallet address
                  <input
                    value={recipient}
                    required
                    maxLength={64}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Enter a wallet address"
                    onChange={(e) => {
                      setRecipient(e.target.value.trim())
                      setPerson(null)
                      setReview(false)
                    }}
                  />
                </label>
                <div className="qc-amount-fields">
                  <label>
                    Amount (QCash)
                    <input
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value)
                        setReview(false)
                      }}
                      required
                    />
                  </label>
                  <label>
                    Network fee (QCash)
                    <input
                      inputMode="numeric"
                      value={fee}
                      onChange={(e) => {
                        setFee(e.target.value)
                        setReview(false)
                      }}
                      required
                    />
                  </label>
                </div>
                <p className="qc-help">
                  Whole QCash units. Dena stays separate.{' '}
                  {pending && 'A transfer is pending.'}
                </p>
                <button
                  className="qc-primary"
                  disabled={
                    busy ||
                    pending ||
                    !!lastSigned ||
                    !!loadError ||
                    !!requestError ||
                    !account
                  }
                  type="submit"
                >
                  Review payment
                  <ArrowUpRight aria-hidden="true" />
                </button>
                {review && (
                  <div
                    className="qc-review"
                    role="region"
                    aria-label="Review QCash payment"
                  >
                    <h2>Review payment</h2>
                    <p>
                      {person
                        ? `${person.name} (${person.profileSlug}) · `
                        : ''}
                      Send {amount} QCash to <code>{recipient}</code>
                    </p>
                    <p>
                      Fee: {fee} QCash. Total:{' '}
                      {(units(amount) + units(fee, true)).toString()} QCash.
                    </p>
                    <p>
                      Network: <code>{network?.chainId}</code>
                    </p>
                    <div className="qc-actions">
                      <button
                        className="qc-primary"
                        type="button"
                        disabled={busy || !!loadError || !!requestError}
                        onClick={() => {
                          void send()
                        }}
                      >
                        Authorize and send QCash
                      </button>
                      <button
                        className="qc-secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => setReview(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </form>
            ) : (
              <section
                className="qc-panel qc-compose portal-form"
                aria-labelledby="qc-request-heading"
              >
                <div className="qc-section-title">
                  <span className="qc-icon">
                    <ArrowDownLeft aria-hidden="true" />
                  </span>
                  <div>
                    <span className="qc-eyebrow">GET PAID IN QCASH</span>
                    <h2 id="qc-request-heading">Share a payment request</h2>
                  </div>
                </div>
                <p className="qc-description">
                  Choose an amount, then share the link or let the sender scan
                  your code.
                </p>
                <div className="qc-receive-content">
                  <div className="qc-request-fields">
                    <label>
                      Requested amount (QCash)
                      <input
                        inputMode="numeric"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </label>
                    <label>
                      Payment request link
                      <input value={link} readOnly />
                    </label>
                    <button
                      className="qc-primary"
                      disabled={!link}
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(link).then(
                          () => setStatus('Payment link copied.'),
                          () =>
                            setStatus(
                              'Unable to copy. Select the payment link to copy it.',
                            ),
                        )
                      }}
                    >
                      <Copy aria-hidden="true" />
                      Copy link
                    </button>
                  </div>
                  <div className="qc-qr-wrap">
                    {qr && (
                      <div
                        className="qc-qr"
                        aria-label="QCash payment QR"
                        dangerouslySetInnerHTML={{ __html: qr }}
                      />
                    )}
                    <p className="qc-help">
                      Scan to open this payment request.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
          {receipt && (
            <section
              className="qc-panel qc-receipt"
              aria-label="QCash payment receipt"
            >
              <div className="qc-section-title">
                <span className="qc-icon">
                  {observed?.status === 'confirmed' && !loadError ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <History aria-hidden="true" />
                  )}
                </span>
                <div>
                  <span className="qc-eyebrow">PAYMENT RECEIPT</span>
                  <h2 aria-live="polite">{receiptState}</h2>
                </div>
              </div>
              {submitted && (
                <>
                  <p>
                    Amount: <strong>{submitted.amount} QCash</strong> · To:{' '}
                    <code>{submitted.recipient}</code>
                  </p>
                  <p>
                    Fee: {submitted.fee} QCash · Total:{' '}
                    {(
                      units(submitted.amount) + units(submitted.fee, true)
                    ).toString()}{' '}
                    QCash
                  </p>
                </>
              )}
              <details className="qc-disclosure">
                <summary>Transaction details</summary>
                <p>
                  Transaction: <code>{receipt}</code>
                </p>
                <p className="qc-help">
                  Confirmations can change. A downloaded receipt records the
                  status at download time.
                </p>
              </details>
              <button
                className="qc-secondary"
                type="button"
                onClick={downloadReceipt}
              >
                <Download aria-hidden="true" />
                Download payment receipt
              </button>
            </section>
          )}
          {lastSigned && (
            <button
              className="qc-secondary"
              type="button"
              disabled={busy || !!loadError || !!requestError}
              onClick={() => {
                void retry()
              }}
            >
              Retry same signed transfer
            </button>
          )}
          <section className="qc-panel qc-history">
            <h2>
              <History aria-hidden="true" />
              Recent QCash transfers
            </h2>
            {loadError ? (
              <p>
                Transfer history is unavailable until the connection returns.
              </p>
            ) : !account?.transactions.length ? (
              <p className="qc-help">
                Your payments will appear here. Share a request to receive your
                first QCash.
              </p>
            ) : (
              <ul>
                {account.transactions.map((tx) => (
                  <li key={tx.id}>
                    <div>
                      <strong>
                        {tx.recipient === wallet.address ? 'Received' : 'Sent'}{' '}
                        {tx.amount} QCash
                      </strong>
                      <span className="qc-help">
                        {tx.status} · {tx.confirmations} confirmation
                        {tx.confirmations === 1 ? '' : 's'}
                      </span>
                    </div>
                    <code title={tx.id}>{tx.id}</code>
                  </li>
                ))}
              </ul>
            )}
            <p className="qc-help">
              Confirmations can change during a reorganization. This beta has no
              guaranteed finality threshold.
            </p>
          </section>
        </>
      )}
      <p
        className="qc-activity"
        role="status"
        aria-label="Wallet activity"
        aria-live="polite"
      >
        {busy
          ? 'Working…'
          : loadError && wallet
            ? 'Connection unavailable. Balances and payment status will refresh when reconnected.'
            : observed?.status === 'confirmed' &&
                status.startsWith('Transfer submitted')
              ? `Transfer confirmed · ${observed.confirmations} confirmations.`
              : status}
      </p>
      <footer className="qc-footer">
        <p>
          <span className="qc-beta">BETA</span> Test coins have no stated
          monetary value. Transfers are public; this network has not been
          independently audited.
        </p>
        <div className="qc-footer-details">
          {network && (
            <details className="qc-disclosure">
              <summary>Beta network details · Block {network.height}</summary>
              <p>
                Network: <code>{network.chainId}</code>
              </p>
              <p>
                ML-DSA signatures. Beta test coins may be reset in a future
                release.
              </p>
            </details>
          )}
          {network && mode === 'receive' && (
            <details className="qc-disclosure">
              <summary>Receive by profile name</summary>
              <ProfileWallet chainId={network.chainId} />
            </details>
          )}
        </div>
      </footer>
    </section>
  )
}
