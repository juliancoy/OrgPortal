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
  return <section className="portal-section finance-wallet-card" aria-label="QCash Beta currency">
    <h2>QCash Beta</h2>
    <p>Try sending and receiving test coins with your own wallet. Beta coins have no stated monetary value and do not convert to Dena.</p>
    <p>{availability}</p>
    <div className="finance-action-row"><Link className="finance-action primary" to="/send?currency=QCash">Send QCash</Link><Link className="finance-action secondary" to="/receive?currency=QCash">Receive QCash</Link><Link className="finance-action secondary" to="/finance/qcash/mining">Mining</Link></div>
  </section>
}
