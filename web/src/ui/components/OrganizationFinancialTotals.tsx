type CurrencyTotal={currency:string;received:number;disbursed:number}
export type FinancialTotals={currencies:CurrencyTotal[];missingAmounts:number;awards?:CurrencyTotal[];missingAwardAmounts?:number}
function formatAmount(amount:number,currency:string){
 try{return new Intl.NumberFormat(undefined,{style:'currency',currency,currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(amount)}
 catch{return `${amount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`}
}
function FinancialAmounts({totals,direction}:{totals?:FinancialTotals;direction:'received'|'disbursed'}){
 return <>{!totals?'Unavailable':totals.currencies.length?totals.currencies.map(total=><span key={total.currency}>{formatAmount(total[direction],total.currency)}</span>):totals.missingAmounts?'Amount unavailable':'No cash payments recorded'}</>
}
function PaymentCoverage({totals}:{totals?:FinancialTotals}){
 if(!totals||totals.currencies.length||totals.missingAmounts)return null
 return <p className="organization-payment-coverage">No cash-payment evidence in this snapshot. The map and evidence list also include funding commitments, such as obligations and awards, and annual revenue and expense observations. These do not establish individual cash payments.</p>
}
function ReportedAwards({totals}:{totals?:FinancialTotals}){
 if(!totals?.awards?.length&&!totals?.missingAwardAmounts)return null
 return <div className="organization-reported-awards" aria-label="Reported awards, separate from payments">
  {totals.awards?.map(total=><p key={total.currency}>
   {!!total.received&&<span>Reported awards to this group: {formatAmount(total.received,total.currency)}</span>}
   {!!total.disbursed&&<span>Reported awards by this group: {formatAmount(total.disbursed,total.currency)}</span>}
  </p>)}
  <p>Awards are excluded from received and disbursed totals; payment is not established by an award.</p>
  {!!totals.missingAwardAmounts&&<p>{totals.missingAwardAmounts.toLocaleString()} award records without usable amounts excluded</p>}
 </div>
}
export function OrganizationFinancialBubbles({totals,fy='all'}:{totals?:FinancialTotals;fy?:string}){
 return <section className="organization-map-funds" aria-label="Map financial totals">
  <p>Recorded cash payments · {fy==='all'?'All years':fy==='unassigned'?'Year unavailable':`FY${fy}`}</p>
  <dl>{(['received','disbursed'] as const).map(direction=><div key={direction} data-direction={direction}>
   <dt>{direction==='received'?'Total received':'Total disbursed'}</dt><dd><FinancialAmounts totals={totals} direction={direction}/></dd>
  </div>)}</dl>
  <PaymentCoverage totals={totals}/>
  <ReportedAwards totals={totals}/>
  {!!totals?.missingAmounts&&<p>{totals.missingAmounts.toLocaleString()} records without usable amounts excluded</p>}
 </section>
}
export function OrganizationFinancialTotals({totals,fy='all',organizationCount=1}:{totals?:FinancialTotals;fy?:string;organizationCount?:number}){
 return <section className="organization-financial-summary" aria-label="Recorded financial totals">
  <p className="muted">Recorded cash payments</p>
  <dl className="organization-financial-totals">{(['received','disbursed'] as const).map(direction=><div key={direction} data-direction={direction}>
   <dt>{direction==='received'?'Total received':'Total disbursed'}</dt>
   <dd><FinancialAmounts totals={totals} direction={direction}/></dd>
  </div>)}</dl>
  <PaymentCoverage totals={totals}/>
  {organizationCount>1&&<p>Consolidated across {organizationCount.toLocaleString()} organizations in this hierarchy or display group. Each external transfer is counted once; transfers within this scope are excluded.</p>}
  <ReportedAwards totals={totals}/>
  <p className="muted">Recorded payments and transfers {fy==='all'?'across all dates':fy==='unassigned'?'with no assigned fiscal year':`for FY${fy}`} in this snapshot, including signed adjustments. Annual statement amounts, awards, approvals, appropriations and obligations are excluded. These totals are not balances or complete financial statements.</p>
  {!!totals?.missingAmounts&&<p>{totals.missingAmounts.toLocaleString()} transfer records have no usable amount or currency and are excluded from these totals.</p>}
 </section>
}
