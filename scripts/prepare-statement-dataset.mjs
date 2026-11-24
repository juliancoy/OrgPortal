// Merge reviewed additions into a checksum-verified current public dataset.
// No native records are copied and no source rows are silently overwritten.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {canonicalJson} from '../org-worker/src/eventOperationStore.ts'
import {fetchPublicEvidenceJson} from '../web/scripts/unified-ecosystem.mjs'
const [input,output]=process.argv.slice(2)
if(!input||!output)throw Error('Usage: prepare-statement-dataset.mjs additions.json output.json')
const add=JSON.parse(await readFile(input,'utf8')),rows=[],hash=x=>createHash('sha256').update(x).digest('hex')
const base='https://orgportal.cc/api/org/api/network/ecosystem/public'
let parentDatasetId
for(const collection of ['organizations','relationships','financing','events','nonprofitProfiles','performanceRecords','performanceAssessments','metadata','positions']){
 let after=''
 do{
  const url=new URL(base+'/'+collection);if(after)url.searchParams.set('after',after);if(parentDatasetId)url.searchParams.set('datasetId',parentDatasetId)
  const page=await fetchPublicEvidenceJson(url)
  if(parentDatasetId&&parentDatasetId!==page.datasetId)throw Error('Dataset changed during export')
  parentDatasetId=page.datasetId
  for(const r of page.records){if(hash(canonicalJson(r.value))!==r.sha256)throw Error('Source checksum mismatch');rows.push({collection,...r})}
  if(page.next!==null&&page.next<=after)throw Error('Invalid cursor');after=page.next
 }while(after!==null)
 console.log(collection,rows.filter(r=>r.collection===collection).length)
}
const sort=()=>rows.sort((a,b)=>(a.collection+'\t'+a.key)<(b.collection+'\t'+b.key)?-1:1)
const digest=()=>hash(rows.map(r=>`${r.collection}\t${r.key}\t${r.sha256}\n`).join(''))
sort();if(digest()!==parentDatasetId)throw Error('Export does not reconcile to current dataset')
const originalCount=rows.length,keys=new Set(rows.map(r=>r.collection+':'+r.key)),ids=new Set(rows.filter(r=>r.collection==='organizations').map(r=>r.value.id))
// Canonical directory entries may be newer than the base dataset. Verify them
// remotely before adding their public graph identity; never create an identity.
for(const profile of add.nonprofitProfiles||[])if(!ids.has(profile.organizationId)){
 const live=await fetchPublicEvidenceJson('https://orgportal.cc/api/ecosystem/organization-group?org='+encodeURIComponent(profile.organizationId))
 if(live.organization?.id!==profile.organizationId)throw Error('Canonical organization unavailable')
 add.organizations.push({id:profile.organizationId,name:live.organization.name,portalSlug:live.organization.slug,type:'Nonprofit organization',category:'general',identifiers:{ein:profile.ein},sourceCategory:'IRS Form 990',identityEvidence:{ein:profile.ein,sourceUrl:profile.sourceUrl,sourceSha256:profile.sourceSha256}})
}
for(const collection of ['organizations','relationships','nonprofitProfiles'])for(const value of add[collection]||[]){
 if(collection==='relationships'&&![value.source,value.target].every(id=>ids.has(id)||(add.organizations||[]).some(n=>n.id===id)))throw Error('Unknown organization endpoint '+value.id)
 const key=hash(value.id||value.ein);if(keys.has(collection+':'+key))throw Error('Existing record needs explicit correction review '+value.id)
 rows.push({collection,key,value,sha256:hash(canonicalJson(value))});keys.add(collection+':'+key)
}
const coverage={id:'data:statementCoverage',value:add.statementCoverage};rows.push({collection:'metadata',key:hash(coverage.id),value:coverage,sha256:hash(canonicalJson(coverage))})
sort();const datasetId=digest();await writeFile(output,JSON.stringify({datasetId,parentDatasetId,rows})+'\n',{mode:0o600})
console.log(JSON.stringify({parentDatasetId,datasetId,preserved:originalCount,added:rows.length-originalCount,fileSha256:hash(await readFile(output))}))
