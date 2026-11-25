import {summarizeOrganizationTransfers} from './organization-financial-totals.mjs'

// Counterparty perspective: a donor disburses to the focus; a payee receives
// from it. Use exactly the focus total's eligibility and deduplication rules.
export function cashRelationshipAccumulator(){
 const totals=new Map()
 const add=(row,incoming,currency)=>{
  const id=incoming?row.source:row.target
  const value=totals.get(id)||{receivedUsd:null,disbursedUsd:null,missingAmounts:0}
  if(!currency||!Number.isFinite(row.amount))value.missingAmounts++
  else if(currency==='USD'){
   const direction=incoming?'disbursedUsd':'receivedUsd'
   value[direction]=(value[direction]??0)+row.amount
  }
  totals.set(id,value)
 }
 return {add,result:()=>Object.fromEntries(totals)}
}

export async function organizationCashRelationships(read,readRows,manifest,profile){
 if(profile.cashRelationships)return profile.cashRelationships
 // Compatibility with existing snapshots and dynamically merged identities.
 // Read the focus's complete evidence once, never every donor's evidence.
 const members=profile.financialMembers||(profile.members||[profile.organization]).map(member=>member.id)
 const ids=profile.recordKinds?.transfer||[],seen=new Set(),summary=cashRelationshipAccumulator()
 for(let offset=0;offset<ids.length;offset+=100){
  const rows=await readRows(read,manifest.version,'relationships',ids.slice(offset,offset+100))
  summarizeOrganizationTransfers(rows,members,seen,summary.add)
 }
 return summary.result()
}
