import {financialEvidence} from '../../features/ecosystem/financial-evidence.js'
export const organizationEvidenceKinds:Record<string,string>={revenue:'Annual revenue observations',expense:'Annual expense observations',transfer:'Payments and other funding records',approval:'Approval observations',appropriation:'Budget appropriations',agency:'Organizational listings',affiliation:'Affiliations',terms:'Program terms',obligation:'Obligations'}
export function organizationEvidenceLabel(row:Parameters<typeof financialEvidence>[0]&{measurement?:string}){
 const fact=financialEvidence(row)
 if(fact==='obligation')return row.financialMeasure==='cumulative_obligations'?'Cumulative obligations (award total)':row.measurement==='delta'?'Obligation transaction (funding commitment)':'Obligation (funding commitment)'
 if(fact==='reported_award')return 'Award / approval (payment not established)'
 if(fact==='disbursement')return 'Recorded payment'
 if(fact==='revenue'||fact==='expense')return `Annual ${fact} (not an individual payment)`
 if(fact==='appropriation')return 'Budget appropriation'
 return row.kind==='transfer'?'Reported transfer':organizationEvidenceKinds[row.kind||'']||row.kind||'Other evidence'
}
