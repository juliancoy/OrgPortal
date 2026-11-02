import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pqcoinFetch, type Network } from './api'
export function PqcoinCurrencyCard() {
  const [availability, setAvailability] = useState('Checking testnet availability…')
  useEffect(() => {
    let active = true
    void pqcoinFetch<Network>('/network').then(
      network => { if (active) setAvailability(`Testnet available · Height ${network.height}`) },
      () => { if (active) setAvailability('Testnet unavailable or not configured on this portal.') },
    )
    return () => { active = false }
  }, [])
  return <section className="portal-section finance-wallet-card" aria-label="QCash Testnet currency">
    <h2>QCash Testnet</h2>
    <p>Experimental blockchain currency. Open your test wallet to view its separate balance. QCash does not convert to Dena.</p>
    <p>{availability}</p>
    <div className="finance-action-row"><Link className="finance-action primary" to="/send?currency=QCash">Send QCash</Link><Link className="finance-action secondary" to="/receive?currency=QCash">Receive QCash</Link><Link className="finance-action secondary" to="/finance/qcash/mining">Mining</Link></div>
  </section>
}
