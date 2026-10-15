type Organization = {id: string; name: string; portalSlug?: string; category?: string; type?: string}
type Record = {
 id?: string; awardKey?: string; financingId?: string; source?: string | null; target?: string | null;
 funderId?: string | null; recipientId?: string | null; kind?: string; relationship?: string;
 amount?: number | null; amountLabel?: string; currency?: string; date?: string; sourceUrl?: string;
 status?: string; financialMeasure?: string; recipientIdentity?: string;
}
export type OverviewData = {organizations: Organization[]; relationships: Record[]; financing: unknown[]; events?: {id:string}[]}
export function ecosystemOverview(data: OverviewData) {
 const organizations=new Map(data.organizations.map(o=>[o.id,o]))
 const relationships=new Map(data.relationships.filter(r=>r.status!=='voided').map(r=>[r.awardKey||r.id,r]))
 const connected=new Set<string>(),sources=new Set<string>()
 for(const r of relationships.values()){
  for(const id of [r.source,r.target])if(id&&organizations.has(id))connected.add(id)
  if(r.sourceUrl)try{const url=new URL(r.sourceUrl);if(['http:','https:'].includes(url.protocol))sources.add(url.href)}catch{/* Not a public evidence link. */}
 }
 const rows: Record[]=[],ids=new Set<string>(),awards=new Set<string>(),signatures=new Set<string>()
 for(const r of [...data.relationships,...data.financing as Record[]]){
  if(r.status==='voided'||(r.kind||r.relationship)!=='transfer')continue
  if((r.id&&ids.has(r.id))||(r.awardKey&&awards.has(r.awardKey)))continue
  const signature=JSON.stringify([r.source??r.funderId,r.target??r.recipientId,r.amount,r.currency,r.date,r.sourceUrl])
  // Distinct identified awards remain distinct, even if all descriptive fields match.
  if(!r.awardKey&&signatures.has(signature))continue
  if(r.id)ids.add(r.id);if(r.financingId)ids.add(r.financingId);if(r.awardKey)awards.add(r.awardKey)
  signatures.add(signature);rows.push(r)
 }
 const disclosed=rows.filter(r=>Number.isFinite(r.amount)&&(r.currency==='USD'||(!r.currency&&/^\$/.test(r.amountLabel||''))))
 const cents=(records:Record[])=>records.reduce((sum,r)=>sum+Math.round(r.amount!*100),0)
 const government=disclosed.filter(r=>r.financialMeasure==='cumulative_obligations')
 const other=disclosed.filter(r=>r.financialMeasure!=='cumulative_obligations')
 const redacted=disclosed.filter(r=>r.recipientIdentity==='unidentified')
 const nonprofit=disclosed.filter(r=>r.financialMeasure==='reported_nonprofit_grant')
 const future=data.relationships.filter(r=>r.status!=='voided'&&r.financialMeasure==='future_grant_approval'&&r.currency==='USD'&&Number.isFinite(r.amount))
 const placeholders=[...organizations.values()].filter(o=>o.portalSlug==='redacted'||o.type==='Unidentified recipients')
 return {
  organizations:organizations.size,identifiedOrganizations:organizations.size-placeholders.length,placeholders:placeholders.length,
  connectedOrganizations:connected.size,relationships:relationships.size,events:new Set(data.events?.map(e=>e.id)).size,
  sourceLinks:sources.size,fundingRecords:rows.length,disclosedUsdRecords:disclosed.length,undisclosedOrOtherCurrency:rows.length-disclosed.length,
  trackedUsd:cents(disclosed)/100,governmentUsd:cents(government)/100,otherUsd:cents(other)/100,
  governmentAwards:government.length,redactedAwards:redacted.length,redactedUsd:cents(redacted)/100,
  nonprofitUsd:cents(nonprofit)/100,futureNonprofitUsd:cents(future)/100,
  negativeUsd:cents(disclosed.filter(r=>r.amount!<0))/100,
 }
}
