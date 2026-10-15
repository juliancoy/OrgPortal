export const redactedOrganization = {id:'13bb4caf-d044-488d-a79d-bd7f678be3be',name:'Redacted',portalSlug:'redacted'}
export const endpoint = 'https://api.usaspending.gov/api/v2/search/spending_by_award/'
export const fields = ['Award ID','Recipient Name','Recipient UEI','recipient_id','Awarding Agency','Awarding Agency Code','Awarding Sub Agency','Awarding Sub Agency Code','Award Amount','Start Date','End Date','Description','Last Modified Date','generated_internal_id']
export function awardQuery(page, start, end) {
 return {filters:{award_type_codes:['02','03','04','05'],recipient_locations:[{country:'USA',state:'MD'}],time_period:[{start_date:start,end_date:end}]},fields,limit:100,page,sort:'Award Amount',order:'desc',subawards:false}
}
export async function collectAwards(fetcher, start, end, maxPages=500,extraFilters={},allowCap=false) {
 const rows=new Map(), requests=[], messages=new Set()
 for(let page=1;page<=maxPages;page++) {
  const query=awardQuery(page,start,end)
  Object.assign(query.filters,extraFilters)
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),signal:AbortSignal.timeout(60000)})
  if(!response.ok)throw new Error(`USAspending page ${page}: HTTP ${response.status}`)
  const body=await response.json()
  if(!Array.isArray(body.results)||typeof body.page_metadata?.hasNext!=='boolean')throw new Error(`Invalid USAspending page ${page}`)
  for(const message of body.messages||[])messages.add(message)
  requests.push(query)
  for(const row of body.results){
   if(!row.generated_internal_id)throw new Error('Award lacks government unique ID')
   if(rows.has(row.generated_internal_id))throw new Error('Pagination repeated an award; retry the refresh')
   rows.set(row.generated_internal_id,row)
  }
  if(!body.page_metadata.hasNext){
   if(rows.size>=10000&&!allowCap)throw new Error('Search result cap reached; use smaller amount ranges')
   return {requests,messages:[...messages],capped:rows.size>=10000,results:[...rows.values()]}
  }
  if(!body.results.length)throw new Error('Empty page claims more results')
 }
 throw new Error(`Incomplete import: exceeded ${maxPages} pages`)
}
export function normalizeAwards(raw, retrievedAt, period) {
 const organizations=new Map(),relationships=[];let unidentifiedCount=0,unidentifiedCents=0
 const org=(id,name,category,identifiers)=>{
  if(!organizations.has(id))organizations.set(id,{id,name,type:category==='government'?'Federal agency':'Grant recipient',category,website:'',relevance:'USAspending federal grant evidence',proximity:null,publicEmails:[],sourceRows:[],sourceCategory:'USAspending',identifiers})
  return id
 }
 for(const row of raw.results){
  const awardId=row.generated_internal_id,uei=row['Recipient UEI'],recipientId=row.recipient_id
  const agencyCode=row['Awarding Agency Code'],agency=row['Awarding Agency'],name=row['Recipient Name'],amount=row['Award Amount']
  if(!awardId||!agencyCode||!agency||typeof amount!=='number'||!Number.isFinite(amount))throw new Error(`Incomplete award ${awardId}`)
  const unidentified=!name||/REDACTED/i.test(name)||(!uei&&!recipientId)
  if(unidentified){unidentifiedCount++;unidentifiedCents+=Math.round(amount*100)}
  const source=org(`usgov:agency:${agencyCode}`,agency,'government',{usaspendingAgencyCode:agencyCode})
  const target=unidentified?org(redactedOrganization.id,redactedOrganization.name,'general',{}):org(`usgov:recipient:${uei||recipientId}`,name,'general',{...(uei?{uei}:{}),...(recipientId?{usaspendingRecipientId:recipientId}:{})})
  if(unidentified)Object.assign(organizations.get(target),redactedOrganization,{directory:true,type:'Unidentified recipients',relevance:'Grouping for undisclosed government recipients, not a single legal entity.'})
  const sourceUrl=`https://www.usaspending.gov/award/${encodeURIComponent(awardId)}`
  const notes=`Cumulative obligations, not cash paid or period spending. End: ${row['End Date']||'unknown'}. Source updated: ${row['Last Modified Date']||'unknown'}. Retrieved: ${retrievedAt}.`
  relationships.push({id:`usaspending:${awardId}`,awardKey:`usaspending:${awardId}`,awardId:row['Award ID'],source,target,sourceLabel:agency,targetLabel:unidentified?'Redacted':name,recipientIdentity:unidentified?'unidentified':'identified',relationship:'funding',kind:'transfer',amount,currency:'USD',amountLabel:`${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(amount)} cumulative obligations`,date:row['Start Date']||'',type:'Federal grant obligations',description:row.Description||'',notes,sourceUrl,evidence:`USAspending award ${row['Award ID']}`,status:'reported',financialMeasure:'cumulative_obligations',retrievedAt,sourceModifiedAt:row['Last Modified Date']||null,provenance:{sheet:'USAspending official API',awardKey:awardId}})
 }
 return {updatedAt:retrievedAt,endpoint,coverage:{...period,recipientState:'MD',awardTypes:['02','03','04','05'],retrievedAt,dateFilterMeaning:'Default USAspending award date overlap filter; amounts are lifetime cumulative obligations',complete:true,queriedAwardCount:raw.results.length,unidentifiedAwardCount:unidentifiedCount,unidentifiedObligationsUsd:unidentifiedCents/100,awardCount:relationships.length},organizations:[...organizations.values()],relationships,financing:[]}
}

// Search caps at 10,000. Fetch descending obligation ranges with an inclusive
// boundary, deduplicate award IDs, then reconcile against an independent count.
export async function collectGovernmentAwards(fetcher,start,end,onProgress=()=>{},seed=null) {
 const countResponse=await fetcher(endpoint.replace('spending_by_award/','spending_by_award_count/'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:awardQuery(1,start,end).filters}),signal:AbortSignal.timeout(60000)})
 if(!countResponse.ok)throw new Error(`USAspending count: HTTP ${countResponse.status}`)
 const count=await countResponse.json(),expected=count.results?.grants
 if(!Number.isInteger(expected)||expected<0)throw new Error('Invalid independent grant count')
 const results=new Map(),requests=[],messages=new Set()
 let upper=null
 for(let partition=0;partition<100;partition++){
  const batch=partition===0&&seed?{...seed,capped:seed.results.length>=10000}:await collectAwards(fetcher,start,end,500,upper===null?{}:{award_amounts:[{upper_bound:upper}]},true)
  requests.push(...batch.requests);for(const message of batch.messages||[])messages.add(message)
  for(const row of batch.results)results.set(row.generated_internal_id,row)
  onProgress(`${batch.results.length} awards in amount range; ${results.size} unique of ${expected}`)
  if(!batch.capped)break
  const minimum=Math.min(...batch.results.map(r=>r['Award Amount']))
  if(!Number.isFinite(minimum)||(upper!==null&&minimum>=upper))throw new Error('Cannot safely partition awards at amount boundary; retain last good snapshot')
  upper=minimum
 }
 if(results.size!==expected)throw new Error(`Incomplete or changing feed: expected ${expected} unique grants, retrieved ${results.size}; retry`)
 return {requests,messages:[...messages],expectedAwardCount:expected,results:[...results.values()]}
}
