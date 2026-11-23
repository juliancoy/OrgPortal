import {financialEvidence} from '../src/features/ecosystem/financial-evidence.js'
// Awards and payments are separate observations, never additive cash flow.
export function summarizeOrganizationTransfers(records, memberIds, seen=new Set()) {
 const members=new Set(memberIds),currencies=new Map(),awards=new Map()
 let missingAmounts=0,missingAwardAmounts=0
 for(const row of records){
  const fact=financialEvidence(row),award=fact==='reported_award'
  if(row.kind!=='transfer'||row.status==='voided'||['obligation','appropriation','program_ceiling','balance','rescission','administration'].includes(fact))continue
  const incoming=members.has(row.target),outgoing=members.has(row.source)
  if(incoming===outgoing)continue // Exclude transfers within a displayed grouping.
  const key=row.transactionRecordId||row.id
  if(key&&seen.has(key))continue
  if(key)seen.add(key)
  const currency=row.currency||(/^\$/.test(row.amountLabel||'')?'USD':null)
  if(!currency||!Number.isFinite(row.amount)){if(award)missingAwardAmounts++;else missingAmounts++;continue}
  const bucket=award?awards:currencies
  const total=bucket.get(currency)||{currency,received:0,disbursed:0}
  total[incoming?'received':'disbursed']+=row.amount
  bucket.set(currency,total)
 }
 return {currencies:[...currencies.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),missingAmounts,
  ...(awards.size||missingAwardAmounts?{awards:[...awards.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),missingAwardAmounts}:{})}
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
  const currencies=new Map(),awards=new Map();let missingAmounts=0,missingAwardAmounts=0
  for(const summary of summaries){
   missingAmounts+=summary.missingAmounts
   missingAwardAmounts+=summary.missingAwardAmounts||0
   for(const total of summary.awards||[]){const sum=awards.get(total.currency)||{currency:total.currency,received:0,disbursed:0};sum.received+=total.received;sum.disbursed+=total.disbursed;awards.set(total.currency,sum)}
   for(const total of summary.currencies){const sum=currencies.get(total.currency)||{currency:total.currency,received:0,disbursed:0};sum.received+=total.received;sum.disbursed+=total.disbursed;currencies.set(total.currency,sum)}
  }
  return {currencies:[...currencies.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),missingAmounts,
   ...(awards.size||missingAwardAmounts?{awards:[...awards.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),missingAwardAmounts}:{})}
 })()
 cache.entries.set(key,pending)
 if(cache.entries.size>256)cache.entries.delete(cache.entries.keys().next().value)
 try{return await pending}catch(error){cache.entries.delete(key);throw error}
}
