import {useEcosystemQuery,type QueryPage} from '../../features/ecosystem/ecosystemApi'

type StatementLine={label:string;sourceLine:string;amount:number}
type Statement={lines:StatementLine[];total:number|null;reconciled:boolean}
type AnnualStatement={id:string;organizationId:string;name:string;ein:string;periodStart:string;periodEnd:string;accountingBasis:string;sourceUrl:string;sourceSha256:string;revenue:number|null;expenses:number|null;assets:number|null;liabilities:number|null;statements?:{revenue:Statement;expenses:Statement}}
const money=(n:number|null)=>n!==null&&Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n):'Unavailable'
export function OrganizationAnnualStatements({organizationId,fy}:{organizationId:string;fy?:string}){
 const {data,error}=useEcosystemQuery<QueryPage<AnnualStatement>>('nonprofits',{org:organizationId,limit:50})
 if(error)return <p role="status">Annual statements unavailable: {error}</p>
 const rows=data?.records.filter(row=>row.statements&&(!fy||fy==='all'||row.periodEnd.slice(0,4)===fy))||[]
 if(!rows.length)return null
 return <section className="organization-annual-statements" aria-label="Annual financial statements">
  <h4>Annual financial statements</h4>
  <p className="muted">Reported revenue and expenses, separate from cash payments, awards and proposed budgets. Amounts can overlap funding records; do not add them together.</p>
  {rows.map(row=><details key={row.id}>
   <summary>{row.periodStart} – {row.periodEnd} · Revenue {money(row.revenue)} · Expenses {money(row.expenses)}</summary>
   <p>{row.name} · EIN {row.ein} · {row.accountingBasis} accounting</p>
   <p>Public represents customers and purchases on their behalf, including third-party payers. Household, insurer and government shares are not inferred.</p>
   {(['revenue','expenses'] as const).map(kind=><div key={kind}><h5>{kind==='revenue'?'Revenue':'Expenses'}</h5>
    {!row.statements![kind].reconciled&&<p>Available categories do not reconcile to the reported total; breakdown incomplete.</p>}
    <dl>{row.statements![kind].lines.map(line=><div key={line.sourceLine}><dt>{line.label}</dt><dd>{money(line.amount)}</dd></div>)}</dl>
   </div>)}
   <dl><div><dt>Assets at period end</dt><dd>{money(row.assets)}</dd></div><div><dt>Liabilities at period end</dt><dd>{money(row.liabilities)}</dd></div></dl>
   {/^https:\/\/projects\.propublica\.org\//.test(row.sourceUrl)&&<a href={row.sourceUrl} target="_blank" rel="noreferrer">Source filing ↗</a>}
   <p className="muted">Source SHA-256: <code>{row.sourceSha256}</code></p>
  </details>)}
 </section>
}
