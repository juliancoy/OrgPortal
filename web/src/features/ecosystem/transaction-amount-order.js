// Stable global ranks let each inspector sort its evidence IDs before fetching
// a single bounded page. Never download an agency's entire ledger on hover.
export function transactionAmountRanks(records){
 const currency=row=>row.currency||(/^\$/.test(row.amountLabel||'')?'USD':'')
 const amount=row=>Number.isFinite(row.amount)?row.amount:-Infinity
 const indices=records.map((_,i)=>i).filter(i=>['transfer','approval','obligation','appropriation','revenue','expense'].includes(records[i].kind)&&records[i].status!=='voided')
 indices.sort((a,b)=>{
  const ca=currency(records[a]),cb=currency(records[b])
  return Number(cb==='USD')-Number(ca==='USD')||ca.localeCompare(cb)||amount(records[b])-amount(records[a])||a-b
 })
 const ranks=Array(records.length).fill(null)
 indices.forEach((index,rank)=>{ranks[index]=rank})
 return ranks
}
