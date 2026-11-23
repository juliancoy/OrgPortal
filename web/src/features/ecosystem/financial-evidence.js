// Classify source evidence without treating an announced grant as cash received.
// Explicit financial facts and payment evidence take precedence over grant names.
export function financialEvidence(row){
 if(row.financialFactType)return row.financialFactType
 if(row.financialMeasure==='reported_disbursement'||row.status==='delivered'||row.grantStatus==='paid')return 'disbursement'
 if(row.financialMeasure==='cumulative_obligations')return 'obligation'
 if(['future_grant_approval','reported_approval'].includes(row.financialMeasure))return 'reported_award'
 if(row.kind==='transfer'&&(
  /\b(?:grant|award)\b/i.test(`${row.type||''} ${row.description||''} ${row.evidence||''}`)||
  /\bpayment unverified\b/i.test(row.notes||'')))return 'reported_award'
 return null
}
