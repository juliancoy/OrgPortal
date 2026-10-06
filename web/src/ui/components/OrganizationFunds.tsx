import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadOrganizationFunds, type FundOrganization } from './organizationFunds'

export function OrganizationFunds({ organization, refresh }: { organization: { id: string; name: string }; refresh: number }) {
 const [funds, setFunds] = useState<FundOrganization[] | null>(null)
 const [error, setError] = useState('')
 useEffect(() => {
  const controller = new AbortController()
  setFunds(null); setError('')
  void loadOrganizationFunds(organization, fetch, controller.signal)
   .then(result => { if (!controller.signal.aborted) setFunds(result) })
   .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load funds') })
  return () => controller.abort()
 }, [organization.id, organization.name, refresh])
 return <section aria-label="Organization funds">
  <h2>Funds</h2>
  <p className="muted">Registered funds bearing this organization’s name. Each fund has its own page and documented financial records; amounts are not added to this organization’s totals.</p>
  {error ? <p role="status">{error}</p> : funds === null ? <p role="status">Loading funds…</p> : funds.length ? <ul className="support-organizations">{funds.map(fund => <li key={fund.id}><Link to={`/orgs/${encodeURIComponent(fund.slug)}`}>{fund.name}</Link></li>)}</ul> : <p>No registered named funds found.</p>}
 </section>
}
