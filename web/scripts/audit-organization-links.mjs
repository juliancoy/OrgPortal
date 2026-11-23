import {readTopology} from '../server/topology.mjs'
// Read-only audit of the exact generated snapshot used by organization EcoMaps.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {graphRelationships} from '../src/features/ecosystem/portal-ecosystem.js'
const root=new URL('../public/ecosystem-data/query/',import.meta.url),out=process.argv[2]||'/tmp/organization-link-audit'
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'))
const manifest=await read('manifest.json'),version=manifest.version
const sourceStatus=process.env.ORGPORTAL_AUDIT_SOURCE_STATUS||'Local public query snapshot; remote freshness was not checked by this script.'
async function* rows(name){for(const file of (await readdir(new URL(`${version}/${name}/`,root))).filter(f=>/^\d+\.json$/.test(f)).sort((a,b)=>parseInt(a)-parseInt(b)))for(const row of await read(`${version}/${name}/${file}`))yield row}
const nodes=new Map(),profiles=new Map()
for await(const o of rows('organizations'))nodes.set(o.id,{id:o.id,name:o.name,slug:o.portalSlug||'',category:o.category||'',entityType:o.entityType||'',identityStatus:o.identityStatus||'',sourceCategory:o.sourceCategory||'',governmentParentId:o.governmentParentId||'',classification:o.governmentClassification||'',budgetAgencyCode:o.budgetAgencyCode||'',incoming:new Set(),outgoing:new Set(),neighbors:new Set(),graphRecords:0,evidenceRecords:0,kinds:{},externalRecords:0})
for await(const p of rows('organization-evidence'))profiles.set(p.organization.id,p)
const topology=await readTopology(read,version),endpoint=v=>typeof v==='number'?topology.nodeIds[v]:v
const directedPairs=new Set(),graphKinds={},danglingGraph=[],selfLinks=[]
for(const [a,b,kind] of topology.edges){const source=endpoint(a),target=endpoint(b);graphKinds[kind]=(graphKinds[kind]||0)+1
 if(!nodes.has(source)||!nodes.has(target)){danglingGraph.push({source,target});continue}
 if(source===target){selfLinks.push(source);continue}
 directedPairs.add(JSON.stringify([source,target]));const s=nodes.get(source),t=nodes.get(target)
 s.outgoing.add(target);t.incoming.add(source);s.neighbors.add(target);t.neighbors.add(source);s.graphRecords++;t.graphRecords++
}
const recordKeys=new Set(),nativeIds=new Set(),nativeTypes={},evidenceKinds={},excludedKinds={},externalAgencies=new Map(),missingEndpoint=[],duplicateRecords=[],profileOnlyNodes=new Map(),excludedSamples=[]
let evidenceCount=0,externalCount=0,attachedCount=0,nativeAssignedExternal=0,voided=0,noDate=0,noSourceUrl=0,selfEvidence=0
for await(const row of rows('relationships')){
 evidenceCount++;const key=row.transactionRecordId||row.id
 if(row.transactionRecordId){nativeIds.add(row.transactionRecordId);nativeTypes[row.sourceRecordType]=(nativeTypes[row.sourceRecordType]||0)+1}
 if(recordKeys.has(key)){duplicateRecords.push({key,source:row.source,target:row.target});continue}recordKeys.add(key)
 const kind=row.kind||row.relationship||'other';evidenceKinds[kind]=(evidenceKinds[kind]||0)+1
 if(row.status==='voided')voided++
 if(!row.date)noDate++;if(!row.sourceUrl)noSourceUrl++
 if(row.source&&row.source===row.target)selfEvidence++
 if(!graphRelationships({relationships:[row]},{includeCapitalization:true}).length){excludedKinds[kind]=(excludedKinds[kind]||0)+1;if(excludedSamples.length<15)excludedSamples.push({id:row.id,kind,source:row.source,target:row.target})}
 for(const id of new Set([row.source,row.target])){
  const node=nodes.get(id)
  if(!id||(!node&&!profiles.has(id))){missingEndpoint.push({record:key,endpoint:id||null,kind});continue}
  const item=node||profileOnlyNodes.get(id)||{id,name:profiles.get(id).organization.name,evidenceRecords:0,kinds:{},externalRecords:0}
  item.evidenceRecords++;item.kinds[kind]=(item.kinds[kind]||0)+1;if(row.sourceRecordType==='external_financial_observation')item.externalRecords++
  if(!node)profileOnlyNodes.set(id,item)
 }
 if(row.sourceRecordType==='external_financial_observation'){
  externalCount++;if(row.agencyAttachment)attachedCount++;else if(row.sourceIdentityId)nativeAssignedExternal++
  const k=JSON.stringify([row.sourceSystem,row.sourceDataset,row.provenance?.agency_code,row.source])
  const a=externalAgencies.get(k)||{id:row.source,name:nodes.get(row.source)?.name||row.sourceLabel,system:row.sourceSystem,dataset:row.sourceDataset,code:row.provenance?.agency_code||'',attached:!!row.agencyAttachment,nativeAssigned:!!row.sourceIdentityId,count:0}
  a.count++;externalAgencies.set(k,a)
 }
}
const summary=n=>({id:n.id,name:n.name,slug:n.slug,category:n.category,identityStatus:n.identityStatus,sourceCategory:n.sourceCategory,classification:n.classification,neighbors:n.neighbors.size,incoming:n.incoming.size,outgoing:n.outgoing.size,graphRecords:n.graphRecords,evidenceRecords:n.evidenceRecords,externalRecords:n.externalRecords,kinds:n.kinds})
const all=[...nodes.values()],isolated=all.filter(n=>!n.neighbors.size),degrees=all.map(n=>n.neighbors.size).sort((a,b)=>a-b),percentile=p=>degrees[Math.ceil((degrees.length-1)*p)]
const bins=[[0,0],[1,1],[2,2],[3,5],[6,10],[11,50],[51,100],[101,500],[501,Infinity]].map(([min,max])=>({range:min===max?String(min):`${min}–${max===Infinity?'max':max}`,nodes:degrees.filter(n=>n>=min&&n<=max).length}))
const groups=predicate=>{const ns=all.filter(predicate);return {nodes:ns.length,isolated:ns.filter(n=>!n.neighbors.size).length,oneNeighbor:ns.filter(n=>n.neighbors.size===1).length,withEvidence:ns.filter(n=>n.evidenceRecords).length,meanNeighbors:ns.reduce((s,n)=>s+n.neighbors.size,0)/(ns.length||1)}}
const seen=new Set(),components=[]
for(const node of all){if(seen.has(node.id))continue;const stack=[node.id];seen.add(node.id);let size=0,example=node.id
 while(stack.length){const current=nodes.get(stack.pop());size++;for(const id of current.neighbors)if(!seen.has(id)){seen.add(id);stack.push(id)}}components.push({size,example,name:nodes.get(example).name})}
components.sort((a,b)=>b.size-a.size)
const normalize=name=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]/g,'')
const names=new Map();for(const n of all){const key=normalize(n.name);if(key){if(!names.has(key))names.set(key,[]);names.get(key).push(n)}}
const collisions=[...names.entries()].filter(([,ns])=>ns.length>1).map(([key,ns])=>({normalizedName:key,nodes:ns.map(summary),incidentEvidence:ns.reduce((s,n)=>s+n.evidenceRecords,0)})).sort((a,b)=>b.incidentEvidence-a.incidentEvidence)
const missedDirectory=collisions.filter(g=>g.nodes.some(n=>n.slug&&n.neighbors===0)&&g.nodes.some(n=>!n.slug&&n.evidenceRecords>0))
const labelDirectory=collisions.filter(g=>g.nodes.some(n=>n.slug)&&g.nodes.some(n=>n.identityStatus==='unverified_label'))
const profileMismatches=[]
for(const [id,p] of profiles){const n=nodes.get(id)||profileOnlyNodes.get(id),actual=n?.evidenceRecords||0;if(actual!==p.organization.recordCount||actual!==p.recordIndices.length)profileMismatches.push({id,name:p.organization.name,indexed:p.organization.recordCount,indices:p.recordIndices.length,actual})}
const aliases=await read(`${version}/organization-evidence/index.json`)
const maryland=profiles.get('research-state-maryland')
const stateChildren=(maryland?.children||[]).map(p=>{const n=nodes.get(p.id);return {...(n?summary(n):p),classification:p.classification}})
const stats={snapshot:{version,generatedAt:manifest.generatedAt,datasetId:manifest.transactionalCoverage.datasetId,exportedAt:manifest.transactionalCoverage.exportedAt,source:sourceStatus},definitions:{link:'Distinct adjacent node, ignoring direction; reciprocal connections count once. Self links excluded. Matches the embedded organization map.',incoming:'Distinct source neighbors',outgoing:'Distinct target neighbors',graphRecords:'Incident graph-visible observations, not unique counterparties or monetary totals.',evidenceRecords:'Incident master/public evidence observations, deduplicated by transactionRecordId or id; includes non-graph record kinds and voided observations.',identityCandidates:'Case/punctuation-normalized name matches only. Review candidates, not verified duplicate identities or authorized merges.'},totals:{nodes:all.length,graphRecords:topology.edges.length,uniqueDirectedPairs:directedPairs.size,uniqueUndirectedPairs:degrees.reduce((a,b)=>a+b,0)/2,evidenceRecords:evidenceCount,uniqueEvidenceRecords:recordKeys.size,isolated:isolated.length,oneNeighbor:degrees.filter(d=>d===1).length,incomingOnly:all.filter(n=>n.incoming.size&&!n.outgoing.size).length,outgoingOnly:all.filter(n=>n.outgoing.size&&!n.incoming.size).length,bothDirections:all.filter(n=>n.incoming.size&&n.outgoing.size).length,meanNeighbors:degrees.reduce((a,b)=>a+b,0)/all.length,medianNeighbors:percentile(.5),p90:percentile(.9),p95:percentile(.95),p99:percentile(.99),maxNeighbors:degrees.at(-1),weakComponents:components.length,largestComponent:components[0].size},distribution:bins,segments:{directory:groups(n=>!!n.slug),unverifiedLabels:groups(n=>n.identityStatus==='unverified_label'),other:groups(n=>!n.slug&&n.identityStatus!=='unverified_label')},integrity:{danglingGraphEndpoints:danglingGraph.length,selfLinks:selfLinks.length,missingEvidenceEndpoints:missingEndpoint.length,duplicateEvidenceKeys:duplicateRecords.length,profileMismatches:profileMismatches.length,nodesMissingProfile:all.filter(n=>!profiles.has(n.id)).length,ambiguousAliases:Object.values(aliases).filter(v=>v===null).length,profileOnlyNodes:[...profileOnlyNodes.values()],nativeUniqueRecords:nativeIds.size,exportedNativeRecords:manifest.transactionalCoverage.nativeRecords,nativeTypes,externalCount,exportedComptrollerRecords:manifest.transactionalCoverage.comptrollerRecords,attachedCount,nativeAssignedExternal,unattachedExternal:externalCount-attachedCount-nativeAssignedExternal,voided,noDate,noSourceUrl,selfEvidence,excludedKinds},identityGaps:{normalizedCollisionGroups:collisions.length,directoryLabelCollisionGroups:labelDirectory.length,isolatedDirectoryWithSameNamedEvidenceGroups:missedDirectory.length,isolatedDirectoryCandidates:missedDirectory.reduce((s,g)=>s+g.nodes.filter(n=>n.slug&&!n.neighbors).length,0),topCandidates:missedDirectory.slice(0,20)},topNodes:all.sort((a,b)=>b.neighbors.size-a.neighbors.size).slice(0,20).map(summary),components:components.slice(0,15),graphKinds,evidenceKinds,unattachedAgencies:[...externalAgencies.values()].filter(a=>!a.attached&&!a.nativeAssigned).sort((a,b)=>b.count-a.count),maryland:{state:summary(nodes.get('research-state-maryland')),children:stateChildren,departmentsWithoutExternal:stateChildren.filter(n=>n.classification==='department'&&!n.externalRecords)},coverage:{government:manifest.governmentCoverage,nonprofits:manifest.nonprofitCoverage,marylandBudget:manifest.marylandBudgetCoverage}}
const stateIds=new Set(stateChildren.map(n=>n.id))
stats.gaps={
 isolatedWithEvidence:isolated.filter(n=>n.evidenceRecords>0).length,
 isolatedDirectoryWithEvidence:isolated.filter(n=>n.slug&&n.evidenceRecords>0).length,
 graphExcludedObservations:Object.values(excludedKinds).reduce((a,b)=>a+b,0),
 mappingMetadataNote:'Records lacking agencyAttachment are still present. Some already point at the correct state-agency node; this count is not a missing-record count.',
 withoutAttachmentAlreadyOnStateAgency:stats.unattachedAgencies.filter(a=>stateIds.has(a.id)).reduce((sum,a)=>sum+a.count,0),
 withoutAttachmentOutsideStateAgencyList:stats.unattachedAgencies.filter(a=>!stateIds.has(a.id)).reduce((sum,a)=>sum+a.count,0),
 nonprofitFundersClassifiedGovernment:all.filter(n=>n.sourceCategory==='nonprofit_grant'&&n.category==='government').map(summary),
 priorities:[
  'Review directory-to-evidence identity links, starting with Comptroller and transit agencies; same-name candidates are not proof of identity.',
  'Expose non-transaction evidence connectivity separately: terms, portfolio and coinvestment observations are indexed but excluded from the current map.',
  'Review cross-dataset identities and missing upstream hierarchy for transport sub-agencies; keep sub-agencies distinct from their parent department.',
  'Review nonprofit funder classifications: the generic source endpoint fallback currently treats an agency-side label as government.',
  'Investigate sparse department coverage with source dates and scope before treating absent payment observations as missing imports.'
 ]
}
await mkdir(out,{recursive:true})
const json=(file,data)=>writeFile(`${out}/${file}`,JSON.stringify(data,null,2)+'\n')
await json('audit.json',stats);await json('identity-candidates.json',{warning:stats.definitions.identityCandidates,candidates:collisions});await json('integrity-details.json',{danglingGraph,missingEndpoint,duplicateRecords,profileMismatches,excludedSamples})
const columns=['id','name','slug','category','identityStatus','sourceCategory','classification','neighbors','incoming','outgoing','graphRecords','evidenceRecords','externalRecords']
const csv=v=>{const text=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(text)?"'":'')+text.replaceAll('"','""')+'"'}
await writeFile(`${out}/nodes.csv`,columns.join(',')+'\n'+all.map(summary).map(n=>columns.map(k=>csv(n[k])).join(',')).join('\n')+'\n')
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const table=(cols,rs)=>'<table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+rs.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'
await writeFile(`${out}/report.html`,'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Organization link audit</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#172b3a}table{border-collapse:collapse;width:100%;margin-bottom:24px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{background:#eef4f7}code{overflow-wrap:anywhere}p{line-height:1.6}</style><h1>Organization link audit</h1><p>Snapshot '+esc(version)+' · '+esc(manifest.generatedAt)+'. '+esc(sourceStatus)+' No identities or source records were changed.</p><p>'+esc(stats.definitions.link)+'</p><h2>Distribution</h2>'+table(['Neighbors','Nodes'],bins.map(b=>[b.range,b.nodes.toLocaleString()]))+'<h2>Coverage by node type</h2>'+table(['Segment','Nodes','Isolated','One neighbor','With evidence'],Object.entries(stats.segments).map(([k,v])=>[k,v.nodes,v.isolated,v.oneNeighbor,v.withEvidence]))+'<h2>Gaps to review</h2><p>'+stats.gaps.isolatedWithEvidence.toLocaleString()+' zero-link nodes nevertheless have evidence. '+stats.gaps.graphExcludedObservations.toLocaleString()+' indexed observations have kinds excluded from the map; these are not lost imports.</p><ol>'+stats.gaps.priorities.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ol><h2>Most connected nodes</h2>'+table(['Node','Neighbors','Incoming','Outgoing','Evidence records'],stats.topNodes.map(n=>[n.name,n.neighbors,n.incoming,n.outgoing,n.evidenceRecords]))+'<h2>Identity gaps to review</h2><p>'+esc(stats.definitions.identityCandidates)+'</p>'+table(['Name','Separate nodes','Isolated directory nodes','Incident evidence'],missedDirectory.slice(0,30).map(g=>[g.nodes[0].name,g.nodes.length,g.nodes.filter(n=>n.slug&&!n.neighbors).length,g.incidentEvidence]))+'<h2>Maryland departments without external observations</h2>'+table(['Department','Neighbors','Evidence','Record kinds'],stats.maryland.departmentsWithoutExternal.map(n=>[n.name,n.neighbors,n.evidenceRecords,Object.keys(n.kinds).join(', ')]))+'<p>Full details: <a href="audit.json">audit.json</a> · <a href="nodes.csv">all node statistics</a> · <a href="identity-candidates.json">identity review candidates</a></p></html>')
// Record inputs to make the analysis reproducible without copying the source dataset.
await json('receipt.json',{date:new Date().toISOString(),scriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),manifestSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),version,snapshotStillCurrent:(await read('manifest.json')).version===version})
console.log(JSON.stringify({version,totals:stats.totals,segments:stats.segments,integrityCounts:{danglingGraphEndpoints:danglingGraph.length,missingEvidenceEndpoints:missingEndpoint.length,duplicateRecords:duplicateRecords.length,profileMismatches:profileMismatches.length},identityCandidateGroups:missedDirectory.length,isolatedWithEvidence:stats.gaps.isolatedWithEvidence,artifacts:out},null,2))
