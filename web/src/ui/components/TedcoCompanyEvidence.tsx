import { useEffect, useState } from 'react'
import { fundingAmount, statusLabels, type RecipientFunding } from './tedcoFunding'

export function CompanyEvidence({ company, showSummary = true }: { company: RecipientFunding; showSummary?: boolean }) {
  return <div className="tedco-company-evidence">
    {showSummary && <p><strong>{company.rank === null ? 'Unranked' : `#${company.rank}`} · {fundingAmount(company.totalUsd)}</strong> · {statusLabels[company.status.value]}</p>}
    <details><summary>Funding and company status evidence</summary>
      <p>Documented agency funding subtotal; incomplete historical coverage. Awards and reported investments do not certify cash received.</p>
      {company.fundingEvidence.length ? <ul>{company.fundingEvidence.map((fact, index) => <li key={index}>{fundingAmount(fact.amountUsd)} · {fact.asOf} · <a href={fact.sourceUrl} target="_blank" rel="noreferrer">Funding source</a><small className="research-company-detail">{fact.evidence}</small>{fact.tags?.map(tag=><span className="support-adjacent-tag" key={tag}>{tag}</span>)}</li>)}</ul> : <p>No recipient-specific monetary amount verified. Unknown does not mean zero.</p>}
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
    fetch(`/api/org/api/network/financing/recipients/${encodeURIComponent(organizationId)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Funding research unavailable')
      const report = await response.json()
      const recipient = report.recipients[0]
      const facts = report.events.filter((event: {type:string}) => event.type === 'agency')
      if (!controller.signal.aborted) setCompany({...recipient,rank:null,totalUsd:facts.length?facts.reduce((sum:number,event:{amountUsd:number})=>sum+event.amountUsd,0):null,fundingEvidence:facts.map((event:{amountUsd:number;sourceUrls:string[];announcedAt:string;label:string;notes:string})=>({amountUsd:event.amountUsd,sourceUrl:event.sourceUrls[0],asOf:event.announcedAt,kind:event.label,evidence:event.notes})),allFundingEvidence:[]})
    }).catch(() => {})
    return () => controller.abort()
  }, [organizationId])
  return company ? <section aria-label="TEDCO funding and company status"><h2>Company status and agency funding</h2><CompanyEvidence company={company} /></section> : null
}
