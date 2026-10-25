import {readFile,writeFile,mkdir,rename,rm,readdir,mkdtemp,stat} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {mergeNetworkHistory,appendNonprofitEvidence} from '../src/features/ecosystem/network-history.js'
import {foldFundNodes,applyFundHierarchy,financialNodePies} from '../src/features/ecosystem/fund-pies.js'
import {networkPreviewSummaries} from '../src/features/ecosystem/ecosystem-view.js'
import {graphRelationships,financialNodeAmounts} from '../src/features/ecosystem/portal-ecosystem.js'
import {geographicPoint} from '../src/features/ecosystem/network-layouts.js'
import {transactionCounts} from '../src/features/ecosystem/zoom-visibility.js'
import {createNetworkAnalysis} from '../src/features/ecosystem/network-analysis.js'
import {ecosystemOverview} from '../src/features/ecosystem/ecosystemOverview.ts'
import {fundingStage} from '../src/features/ecosystem/fundingStatistics.ts'
import {performanceRows,recipientExposure} from '../src/features/ecosystem/performance.ts'
import {normalize,grams,gramBucket,PAGE_SIZE} from '../server/ecosystem-query.mjs'
const root=new URL('../',import.meta.url)
const names=['ecosystem-portal','ecosystem-relationships','ecosystem-history','ecosystem-nonprofits','ecosystem-performance','network-default-positions']
export async function buildEcosystemQuery(){
 const hash=createHash('sha256'),raw=await Promise.all(names.map(name=>readFile(new URL(`public/ecosystem-data/${name}.json`,root),'utf8')))
 for(const value of raw)hash.update(value)
 const sourceFolder=new URL('src/features/ecosystem/',root)
 for(const name of (await readdir(sourceFolder)).filter(n=>/\.(?:js|ts|json)$/.test(n)).sort())hash.update(await readFile(new URL(name,sourceFolder)))
 hash.update(await readFile(new URL(import.meta.url)));hash.update(await readFile(new URL('server/ecosystem-query.mjs',root)))
 const version=hash.digest('hex').slice(0,24),folder=new URL('public/ecosystem-data/query/',root)
 try{const previous=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8'));if(previous.version===version)return previous}catch{}
 const [base,history,events,nonprofit,performance,positions]=raw.map(v=>JSON.parse(v))
 const data=applyFundHierarchy(mergeNetworkHistory(base,appendNonprofitEvidence(history,nonprofit)))
 // Resolve event organization identities using the same canonical merge rules.
 data.events=mergeNetworkHistory({...data,relationships:[],financing:[]},{...events,relationships:[],financing:[]}).events||[]
 const overview=ecosystemOverview(data),folded=foldFundNodes(data),edges=graphRelationships(folded,{includeCapitalization:true})
 const analysis=createNetworkAnalysis(folded.organizations,edges),groups={},membership={}
 for(const mode of ['community','category','county','municipality']){
  const grouping=analysis.communities(mode==='category'?'sector':mode)
  membership[mode]=grouping.membership
  groups[mode]=[...grouping.clusters.values()].map(g=>({id:g.id,name:mode==='community'?(analysis.byId.get(g.id)?.name||g.id):g.id,count:g.members.length})).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id))
 }
 const ranks=new Map();for(const group of analysis.communities().clusters.values())group.members.sort((a,b)=>analysis.adjacency.get(b).size-analysis.adjacency.get(a).size||a.localeCompare(b)).forEach((id,rank)=>ranks.set(id,rank))
 const summaries=networkPreviewSummaries(data),contextPies=financialNodePies(data,{includeCapitalization:true}),amounts=financialNodeAmounts(folded,{includeCapitalization:true})
 const compactPie=pie=>{
  if(!pie)return undefined
  const slices=pie.slices.slice(0,15).map(({records,...slice})=>({...slice,recordCount:records.length}))
  const rest=pie.slices.slice(15)
  if(rest.length)slices.push({label:'Other disclosed counterparties',amount:rest.reduce((s,r)=>s+r.amount,0),color:'#77878c',recordCount:rest.reduce((s,r)=>s+r.records.length,0)})
  let angle=-Math.PI/2;for(const slice of slices){slice.share=slice.amount/pie.total;slice.startAngle=angle;angle+=slice.share*Math.PI*2;slice.endAngle=angle}
  return {...pie,slices}
 }
 const counts=transactionCounts(edges)
 const organizations=folded.organizations.map(o=>({...o,sourceRows:undefined,publicEmails:undefined,positions:positions.organizations?.[o.id],networkMetrics:{pie:compactPie(summaries.pies.get(o.id)),contextPie:compactPie(contextPies.get(o.id)),totals:summaries.totals.get(o.id),counterparties:summaries.counterparties.get(o.id),obligations:summaries.obligationIds.has(o.id),incoming:analysis.incoming.get(o.id),outgoing:analysis.outgoing.get(o.id),amount:amounts.get(o.id),connections:analysis.adjacency.get(o.id)?.size||0,recordCount:counts.get(o.id)||0}})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id))

 await mkdir(folder,{recursive:true})
 const temp=new URL('file://'+(await mkdtemp(fileURLToPath(new URL(`.${version}-`,folder))))+'/'),target=new URL(`${version}/`,folder)
 await mkdir(temp,{recursive:true})
 const write=async(path,value)=>{const bytes=JSON.stringify(value);if(Buffer.byteLength(bytes)>16*1024*1024)throw Error(`Query artifact exceeds 16 MiB: ${path}`);const url=new URL(path,temp);await mkdir(new URL('./',url),{recursive:true});await writeFile(url,bytes)}
 const collection=async(name,records,metadata)=>{
  const index={rows:[],filters:Object.create(null),grams:Object.create(null)}
  const add=(map,key,id)=>{(map[key]??=[]).push(id)}
  records.forEach((r,i)=>{
   const row=metadata(r);row.search=normalize(row.search);index.rows.push(row)
   for(const [field,values] of Object.entries(row.filters||{}))for(const value of new Set(values.filter(Boolean))){index.filters[field]??=Object.create(null);add(index.filters[field],value,i)}
   delete row.filters
   for(const gram of grams(row.search))add(index.grams,gram,i)
  })
  const buckets=Array.from({length:16},()=>Object.create(null));index.gramCounts=Object.create(null)
  for(const [gram,postings] of Object.entries(index.grams)){buckets[Number(gramBucket(gram))][gram]=postings;index.gramCounts[gram]=postings.length}
  delete index.grams
  await write(`${name}/index.json`,index)
  for(let i=0;i<16;i++)await write(`${name}/grams-${i}.json`,buckets[i])
  for(let start=0;start<records.length;start+=PAGE_SIZE)await write(`${name}/${Math.floor(start/PAGE_SIZE)}.json`,records.slice(start,start+PAGE_SIZE))
 }
 const relational=r=>({id:r.id,search:[r.sourceLabel,r.targetLabel,r.type,r.kind,r.date].filter(Boolean).join(' '),date:r.date,filters:{org:[r.source,r.target],kind:[r.kind||r.relationship]}})
 await collection('relationships',data.relationships,relational)
 await collection('events',data.events,r=>({id:r.id,search:[r.title,r.organizationName,r.location,r.date].filter(Boolean).join(' '),date:r.date,filters:{org:[r.organizationId]}}))
 await collection('nonprofits',data.nonprofitProfiles||[],r=>({id:r.ein,search:`${r.name} ${r.ein}`,filters:{org:[r.organizationId]}}))
 await collection('organizations',organizations,r=>({id:r.id,latitude:geographicPoint(r)?r.latitude:null,longitude:geographicPoint(r)?r.longitude:null,search:`${r.name} ${r.type||''} ${r.city||''} ${r.county||''}`,rank:ranks.get(r.id)||0,filters:{org:[r.id],...Object.fromEntries(Object.entries(membership).map(([mode,map])=>[mode,[map.get(r.id)]]))}}))
 await collection('graph',edges.map(({summary,description,notes,evidence,...edge})=>({...edge,type:String(edge.type||'').slice(0,500),notes:String(notes||'').slice(0,500),evidence:String(evidence||'').slice(0,500)})),relational)
 await collection('directory',organizations.map(({id,name,type})=>({id,name,type})),r=>({id:r.id,search:`${r.name} ${r.type||''}`,filters:{org:[r.id]}}))
 const perf=performanceRows(performance,new Date().toISOString().slice(0,10))
 await collection('performance',perf,r=>({id:r.awardKey,search:`${r.recipientName} ${r.awardId} ${r.agency}`,amount:r.amount,program:r.program,assessment:Boolean(r.assessment),cohort:r.assessment?.cohort,attainment:r.assessment?.attainment,meetsTarget:r.assessment?.meetsTarget,reviewedDate:r.assessment?.reviewedDate}))
 const federal=perf.filter(r=>r.program==='Federal grants'),reviewed=perf.filter(r=>r.assessment),exposures=recipientExposure(federal)
 const performanceMeta={coverage:performance.coverage,sourceGeneratedAt:performance.generatedAt,cohorts:[...new Set(reviewed.map(r=>r.assessment.cohort))].sort(),federalCount:federal.length,reviewedCount:reviewed.length,unassessedCount:perf.length-reviewed.length,recipientCount:exposures.length,unidentifiedCount:federal.filter(r=>!r.identified).length,unidentifiedUsd:federal.filter(r=>!r.identified).reduce((s,r)=>s+r.amount,0),exposures:exposures.slice(0,10)}
 await write('overview.json',{stats:overview,redacted:data.organizations.find(o=>o.name==='Redacted')?.id})
 const research=JSON.parse(await readFile(new URL('src/features/ecosystem/funding-research.json',root),'utf8'))
 await write('funding.json',{organizations:data.organizations.filter(o=>o.category==='company').map(({id,name,category})=>({id,name,category})),financing:data.financing.filter(r=>r.kind==='transfer'&&(fundingStage(r.type)||r.type==='Financing round (stage undisclosed)')),research:research.rounds})
 const topology={adjacency:Object.fromEntries([...analysis.adjacency].map(([id,neighbors])=>[id,[...neighbors].sort()])),degree:Object.fromEntries([...analysis.adjacency].map(([id,neighbors])=>[id,neighbors.size])),edges:edges.map(e=>[e.source,e.target,e.kind,e.date]),edgesByOrg:{}}
 edges.forEach((e,i)=>{for(const id of new Set([e.source,e.target]))(topology.edgesByOrg[id]??=[]).push(i)})
 const located=organizations.filter(o=>geographicPoint(o)),geoGroups=new Map()
 for(const o of located){const name=o.county||'Unknown county';if(!geoGroups.has(name))geoGroups.set(name,[]);geoGroups.get(name).push(o)}
 topology.geography={located:located.length,missing:organizations.length-located.length,clusters:[...geoGroups].map(([name,members])=>({id:'geographic-cluster:'+name,name:`${name} · ${members.length} organizations`,type:'Geographic aggregate',category:'general',serverCluster:name,latitude:members.reduce((s,o)=>s+o.latitude,0)/members.length,longitude:members.reduce((s,o)=>s+o.longitude,0)/members.length,count:members.length,bounds:[Math.min(...members.map(o=>o.longitude)),Math.min(...members.map(o=>o.latitude)),Math.max(...members.map(o=>o.longitude)),Math.max(...members.map(o=>o.latitude))],networkMetrics:{}}))}
 const communities=analysis.communities(),clusterById=new Map(groups.community.map(g=>[g.id,{id:'community-cluster:'+g.id,name:`${g.name} community · ${g.count} organizations`,type:'Community aggregate',category:analysis.byId.get(g.id)?.category||'general',serverCommunity:g.id,count:g.count,networkMetrics:{connections:g.count}}]))
 const communityPairs=new Map()
 for(const edge of edges){const a=communities.membership.get(edge.source),b=communities.membership.get(edge.target);if(!a||!b||a===b)continue;const pair=JSON.stringify([a,b].sort());const item=communityPairs.get(pair)||{a,b,count:0};item.count++;communityPairs.set(pair,item)}
 topology.overview={organizations:[...clusterById.values()],relationships:[...communityPairs.values()].map(({a,b,count},i)=>({id:'community-summary:'+i,source:clusterById.get(a).id,target:clusterById.get(b).id,sourceLabel:clusterById.get(a).name,targetLabel:clusterById.get(b).name,kind:'affiliation',relationship:'affiliation',type:`Community connection summary · ${count} evidence records`,aggregate:true,count,provenance:{sheet:'Derived community grouping'},evidence:'Summary between groups, not a claim of a transaction between particular organizations. Expand a community for source records.'}))}
 await write('topology.json',topology)
 const manifest={version,generatedAt:new Date().toISOString(),governmentCoverage:data.governmentCoverage,nonprofitCoverage:data.nonprofitCoverage,totals:{organizations:organizations.length,relationships:edges.length},metricMax:{connections:Math.max(1,...Object.values(topology.degree)),incoming:Math.max(1,...analysis.incoming.values()),outgoing:Math.max(1,...analysis.outgoing.values())},groups,performance:performanceMeta}
 await mkdir(folder,{recursive:true});try{await rename(temp,target)}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;await rm(temp,{recursive:true,force:true})}
 const manifestTemp=new URL(`manifest-${version}-${randomUUID()}.tmp`,folder);await writeFile(manifestTemp,JSON.stringify(manifest));await rename(manifestTemp,new URL('manifest.json',folder))
 const versions=(await readdir(folder)).filter(name=>/^[a-f0-9]{24}$/.test(name)&&name!==version)
 for(const old of versions){const url=new URL(old+'/',folder);try{if(Date.now()-(await stat(url)).mtimeMs>3600000)await rm(url,{recursive:true,force:true})}catch{/* Another build may already have pruned this generated version. */}}
 console.log(`Ecosystem query index ${version}: ${organizations.length} organizations, ${edges.length} graph records, ${data.relationships.length} evidence records`)
 return manifest
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildEcosystemQuery()
