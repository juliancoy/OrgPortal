import {createHash} from 'node:crypto'
export const datasetUrl='https://opendata.maryland.gov/Budget/Maryland-Operating-Budget-Funding-Source/gy87-e27x'
export const apiUrl='https://opendata.maryland.gov/resource/gy87-e27x.json'
export const statusSourceUrl='https://operatingbudget.maryland.gov/'
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
// Status is explicitly reviewed against DBM's current portal, never inferred from year.
export function projectMarylandBudget(rows,{fiscalYear,agencyCode,targetId,targetName,budgetStatus,statusEvidenceUrl=statusSourceUrl,sourceOrganization}){
 if(!Number.isInteger(fiscalYear)||fiscalYear<2017||!agencyCode||!targetId||!targetName||!['legislative_appropriation','working_budget','actual_expenditures','governors_allowance'].includes(budgetStatus))throw Error('Reviewed fiscal year, agency, target identity and budget status required')
 const organizations=new Map(),relationships=[],identities=new Set()
 for(const row of rows){
  if(Number(row.fiscal_year)!==fiscalYear||row.agency_code!==agencyCode)throw Error('Budget row outside reviewed scope')
  for(const field of ['organization_code','fund_type_name','fund_source_code','fund_source_name','program_name','agency_name'])if(!row[field]?.trim())throw Error('Missing budget field '+field)
  if(!/^-?\d+(?:\.\d{1,2})?$/.test(row.budget)||!Number.isSafeInteger(Number(row.budget)*100))throw Error('Invalid budget amount')
  const identity=[fiscalYear,agencyCode,row.organization_code,row.fund_type_name,row.fund_source_code]
  const id='md-budget:'+hash(identity)
  if(identities.has(id))throw Error('Duplicate budget source key');identities.add(id)
  const source=sourceOrganization?.id||'md-budget-fund:'+hash(row.fund_type_name).slice(0,24),name=sourceOrganization?.name||'State of Maryland · '+row.fund_type_name
  if(!sourceOrganization)organizations.set(source,{id:source,name,type:'State budget funding source',entityType:'budget_fund',category:'state-government',directory:false,website:statusSourceUrl,sourceCategory:'Maryland DBM',relevance:'Funding category in the Maryland state operating budget. Federal funds retain their federal origin; this node does not assert a separate cash payment.'})
  const sourceUrl=new URL(apiUrl);sourceUrl.searchParams.set('$where',`fiscal_year=${fiscalYear} AND agency_code='${agencyCode}' AND organization_code='${row.organization_code.replaceAll("'","''")}' AND fund_source_code='${row.fund_source_code.replaceAll("'","''")}' AND fund_type_name='${row.fund_type_name.replaceAll("'","''")}'`)
  relationships.push({id,source,target:targetId,sourceLabel:name,targetLabel:targetName,relationship:'funding',kind:'appropriation',amount:Number(row.budget),currency:'USD',amountLabel:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(row.budget)),date:`${fiscalYear-1}-07-01`,periodStart:`${fiscalYear-1}-07-01`,periodEnd:`${fiscalYear}-06-30`,fiscalYear,budgetStatus,fundType:row.fund_type_name,fundSourceCode:row.fund_source_code,fundSourceName:row.fund_source_name,agencyCode,programCode:row.organization_code,programName:row.program_name,financialFactType:'appropriation',financialMeasure:'budget_authority',measurement:'annual_budget',status:'reported',type:`FY${fiscalYear} ${budgetStatus.replaceAll('_',' ')} · ${row.program_name} · ${row.fund_source_name}`,description:row.description||'',sourceUrl:sourceUrl.href,evidence:`Maryland DBM funding-source row: ${row.organization_code} / ${row.fund_source_code}. Budget status: ${statusEvidenceUrl}`,notes:'Spending authority in the state operating budget, not a cash payment. Do not add to disbursements or combine fiscal years/budget versions. Dataset may exclude reimbursable or other funds; this is not a complete cash-flow statement.',provenance:{sheet:'Maryland DBM operating budget funding sources',datasetUrl,statusSourceUrl:statusEvidenceUrl,sourceRow:row}})
 }
 return {organizations:[...organizations.values()],relationships}
}
