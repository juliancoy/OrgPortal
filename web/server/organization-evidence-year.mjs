import {fiscalMatches} from '../src/features/ecosystem/transaction-time.js'
const readers=new WeakMap()
export async function organizationEvidenceYear(read,readRows,manifest,profile,fy){
 if(!fy||fy==='all')return profile
 let indices=profile.recordFiscalYears?.[fy]
 if(!profile.recordFiscalYears){
  let cache=readers.get(read)
  if(!cache||cache.version!==manifest.version){cache={version:manifest.version,entries:new Map()};readers.set(read,cache)}
  const key=JSON.stringify([(profile.members||[profile.organization]).map(n=>n.id).sort(),fy])
  if(!cache.entries.has(key)){
   const pending=(async()=>{
    const matches=[]
    for(let offset=0;offset<profile.recordIndices.length;offset+=100){
     const ids=profile.recordIndices.slice(offset,offset+100),rows=await readRows(read,manifest.version,'relationships',ids)
     rows.forEach((row,i)=>{if(fiscalMatches(row,fy))matches.push(ids[i])})
    }
    return matches
   })()
   cache.entries.set(key,pending)
   if(cache.entries.size>32)cache.entries.delete(cache.entries.keys().next().value)
  }
  try{indices=await cache.entries.get(key)}catch(error){cache.entries.delete(key);throw error}
 }
 const recordIndices=indices||[],included=new Set(recordIndices),recordKinds=Object.fromEntries(Object.entries(profile.recordKinds).map(([kind,ids])=>[kind,ids.filter(id=>included.has(id))]).filter(([,ids])=>ids.length))
 const financialTotals=profile.financialTotalsByYear?(profile.financialTotalsByYear[fy]||{currencies:[],missingAmounts:0}):undefined
 const cashRelationships=profile.cashRelationshipsByYear?(profile.cashRelationshipsByYear[fy]||{}):undefined
 return {...profile,financialTotals,cashRelationships,organization:{...profile.organization,recordCount:recordIndices.length},recordIndices,recordKinds,groups:Object.entries(recordKinds).map(([kind,ids])=>({kind,count:ids.length}))}
}
