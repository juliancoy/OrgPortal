// Append reviewed evidence to the remotely verified active dataset.
// Retained source identities are reused by ID only; changed source rows stop.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {canonicalJson} from '../org-worker/src/eventOperationStore.ts'
const [basePath,output,...addPaths]=process.argv.slice(2)
if(!basePath||!output||!addPaths.length)throw Error('Usage: prepare-evidence-backfill.mjs verified-base.json output.json additions.json [...]')
const hash=x=>createHash('sha256').update(x).digest('hex'),base=JSON.parse(await readFile(basePath,'utf8'))
const compare=(a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1
const digest=rows=>hash(rows.map(r=>`${r.collection}\t${r.key}\t${r.sha256}\n`).join(''))
const rows=base.rows.sort(compare)
for(const r of rows)if(hash(canonicalJson(r.value))!==r.sha256)throw Error('Cached source row checksum mismatch')
if(digest(rows)!==base.datasetId)throw Error('Cached dataset checksum mismatch')
let current
for(let attempt=0;attempt<4;attempt++){
 try{
  const response=await fetch('https://orgportal.cc/api/org/api/network/ecosystem/public/metadata',{signal:AbortSignal.timeout(60000)})
  if(response.ok){current=await response.json();break}
  if(response.status!==429&&response.status<500)throw Error('Authoritative metadata request rejected')
 }catch(error){if(attempt===3||error instanceof SyntaxError)throw error}
 if(attempt<3)await new Promise(r=>setTimeout(r,1000*2**attempt))
}
if(!current)throw Error('Cannot verify current authoritative dataset')
if(current.datasetId!==base.datasetId)throw Error('Base dataset is stale; export current production data before proceeding')
const existing=new Map(rows.map(r=>[r.collection+':'+r.key,r])),original=rows.length,inputs=[],addedRelationships=[]
for(const path of addPaths){
 const bytes=await readFile(path),add=JSON.parse(bytes);inputs.push({sha256:hash(bytes)})
 for(const collection of ['organizations','relationships','nonprofitProfiles','metadata'])for(const value of add[collection]||[]){
  if(!value.id)throw Error('Every backfill row requires a stable source ID')
  const key=hash(value.id),sha256=hash(canonicalJson(value)),identity=collection+':'+key,prior=existing.get(identity)
  if(prior){
   if(collection==='organizations')continue // Reuse existing identity; never overwrite its profile.
   if(prior.sha256!==sha256)throw Error('Changed existing evidence requires explicit correction: '+value.id)
   continue
  }
  const row={collection,key,value,sha256};rows.push(row);existing.set(identity,row)
  if(collection==='relationships')addedRelationships.push(value)
 }
}
const ids=new Set(rows.filter(r=>r.collection==='organizations').map(r=>r.value.id))
for(const r of addedRelationships)if(!ids.has(r.source)||!ids.has(r.target))throw Error('Unknown new relationship endpoint: '+r.id)
rows.sort(compare);const datasetId=digest(rows)
await writeFile(output,JSON.stringify({datasetId,parentDatasetId:base.datasetId,rows})+'\n',{mode:0o600})
console.log(JSON.stringify({datasetId,parentDatasetId:base.datasetId,preserved:original,added:rows.length-original,inputs,fileSha256:hash(await readFile(output))}))
