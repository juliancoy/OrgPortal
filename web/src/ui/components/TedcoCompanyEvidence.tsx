import { useEffect, useState } from 'react'
import fundingUrl from '../../data/tedco-recipient-funding-status.json?url'
import { fundingAmount, statusLabels, type FundingReport, type RecipientFunding } from './tedcoFunding'

export function CompanyEvidence({ company, showSummary = true }: { company: RecipientFunding; showSummary?: boolean }) {
  return <div className="tedco-company-evidence">
    {showSummary && <p><strong>{company.rank === null ? 'Unranked' : `#${company.rank}`} · {fundingAmount(company.totalUsd)}</strong> · {statusLabels[company.status.value]}</p>}
    <details><summary>Funding and company status evidence</summary>
      <p>Documented TEDCO-administered funding subtotal; incomplete historical coverage. Awards and reported investments do not certify cash received.</p>
      {company.fundingEvidence.length ? <ul>{company.fundingEvidence.map((fact, index) => <li key={index}>{fundingAmount(fact.amountUsd)} · {fact.asOf} · <a href={fact.sourceUrl} target="_blank" rel="noreferrer">Funding source</a><small className="research-company-detail">{fact.evidence}</small></li>)}</ul> : <p>No recipient-specific monetary amount verified. Unknown does not mean zero.</p>}
      {company.otherFundingEvidence?.map((fact,index) => <p key={index}><strong>{fundingAmount(fact.amountUsd)} · {fact.kind}</strong> · {fact.asOf}. {fact.evidence} <a href={fact.sourceUrl} target="_blank" rel="noreferrer">Round source</a></p>)}
      <p><strong>{statusLabels[company.status.value]}</strong>{company.status.asOf && ` · Source date: ${company.status.asOf}`} · Checked {company.status.checkedAt}. {company.status.evidence}</p>
      {company.status.sourceUrl && <a href={company.status.sourceUrl} target="_blank" rel="noreferrer">Status source</a>}
      {company.status.additionalSourceUrl && <> · <a href={company.status.additionalSourceUrl} target="_blank" rel="noreferrer">Successor business source</a></>}
    </details>
  </div>
}

export function TedcoCompanyEvidence({ organizationId }: { organizationId: string }) {
  const [company, setCompany] = useState<RecipientFunding | null>(null)
  useEffect(() => {
    const controller = new AbortController(); setCompany(null)
    fetch(fundingUrl, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Funding research unavailable')
      const report = await response.json() as FundingReport
      if (!controller.signal.aborted) setCompany(report.companies.find(row => row.organizationId === organizationId) || null)
    }).catch(() => {})
    return () => controller.abort()
  }, [organizationId])
  return company ? <section aria-label="TEDCO funding and company status"><h2>Company status and TEDCO funding</h2><CompanyEvidence company={company} /></section> : null
}
