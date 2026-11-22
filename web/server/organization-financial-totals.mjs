// Totals describe recorded transfers, not balances or a complete cash-flow statement.
export function summarizeOrganizationTransfers(records, memberIds, seen=new Set()) {
 const members=new Set(memberIds),currencies=new Map()
 let missingAmounts=0
 for(const row of records){
  if(row.kind!=='transfer'||row.status==='voided'||row.financialMeasure==='cumulative_obligations'||row.financialFactType==='obligation')continue
  const incoming=members.has(row.target),outgoing=members.has(row.source)
  if(incoming===outgoing)continue // Exclude transfers within a displayed grouping.
  const key=row.transactionRecordId||row.id
  if(key&&seen.has(key))continue
  if(key)seen.add(key)
  const currency=row.currency||(/^\$/.test(row.amountLabel||'')?'USD':null)
  if(!currency||!Number.isFinite(row.amount)){missingAmounts++;continue}
  const total=currencies.get(currency)||{currency,received:0,disbursed:0}
  total[incoming?'received':'disbursed']+=row.amount
  currencies.set(currency,total)
 }
 return {currencies:[...currencies.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),missingAmounts}
}

// Older snapshots lack precomputed totals. Read their complete transfer evidence
// in bounded batches, and retain only small summaries per reader and snapshot.
const readers=new WeakMap()
export async function organizationFinancialTotals(read,readRows,manifest,profile,fy='all'){
 if(profile.financialTotals)return profile.financialTotals
 let cache=readers.get(read)
 if(!cache||cache.version!==manifest.version){cache={version:manifest.version,entries:new Map()};readers.set(read,cache)}
 const members=profile.financialMembers|| (profile.members||[profile.organization]).map(member=>member.id).sort()
 const key=JSON.stringify([members,fy||'all'])
 if(cache.entries.has(key))return cache.entries.get(key)
 const pending=(async()=>{
  const ids=profile.recordKinds.transfer||[],summaries=[],seen=new Set()
  for(let offset=0;offset<ids.length;offset+=100){
   const rows=await readRows(read,manifest.version,'relationships',ids.slice(offset,offset+100))
   summaries.push(summarizeOrganizationTransfers(rows,members,seen))
  }
  const currencies=new Map();let missingAmounts=0
  for(const summary of summaries){
   missingAmounts+=summary.missingAmounts
   for(const total of summary.currencies){const sum=currencies.get(total.currency)||{currency:total.currency,received:0,disbursed:0};sum.received+=total.received;sum.disbursed+=total.disbursed;currencies.set(total.currency,sum)}
  }
  return {currencies:[...currencies.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),missingAmounts}
 })()
 cache.entries.set(key,pending)
 if(cache.entries.size>256)cache.entries.delete(cache.entries.keys().next().value)
 try{return await pending}catch(error){cache.entries.delete(key);throw error}
}
