import {fiscalTopology,fiscalMatches} from '../src/features/ecosystem/transaction-time.js'
import {graphSummary} from './graph-summary.mjs'
import {graphNeighborhood} from '../src/features/ecosystem/graph-neighborhood.js'
import {isNotApplicableNode} from '../src/features/ecosystem/node-classes.js'
import {compileFunding,companyKey,fundingSummary,fundingCsv} from '../src/features/ecosystem/fundingStatistics.ts'
import {compareAttainment} from '../src/features/ecosystem/performance.ts'
import {graphRelevance,spreadTransactionRows} from './graph-relevance.mjs'

export const PAGE_SIZE=25, MAX_PAGE=100, MAX_NODES=250, MAX_EDGES=1000
export const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().trim()
export const grams=value=>[...new Set(Array.from({length:Math.max(0,value.length-2)},(_,i)=>value.slice(i,i+3)))]
const integer=(params,key,fallback,max)=>{const raw=params.get(key);if(raw===null)return fallback;if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>max)throw new Error(`Invalid ${key}`);return Number(raw)}
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value
const intersect=(a,b)=>{const values=new Set(b);return a.filter(id=>values.has(id))}
export const gramBucket=gram=>String([...gram].reduce((sum,char)=>sum+char.charCodeAt(0),0)%16)
export function matching(index,params){
 const q=normalize(params.get('q'));if(q.length>128)throw new Error('Search is limited to 128 characters')
 const pools=[]
 for(const key of ['org','kind','category','county','municipality','community'])if(params.get(key))pools.push(Object.hasOwn(index.filters[key]||{},params.get(key))?index.filters[key][params.get(key)]:[])
 if(q.length>=3)for(const gram of grams(q).sort((a,b)=>(index.gramCounts?.[a]||0)-(index.gramCounts?.[b]||0)).slice(0,3))pools.push(index.grams[gram]||[])
 pools.sort((a,b)=>a.length-b.length)
 let ids=pools.length?[...pools[0]]:index.rows.map((_,i)=>i)
 for(const pool of pools.slice(1)){ids=intersect(ids,pool);if(!ids.length)break}
 const from=params.get('from'),to=params.get('to')
 if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw new Error('Invalid date range')
 return ids.filter(i=>{const r=index.rows[i];return (!q||r.search.includes(q))&&(!from||(r.date&&r.date>=from))&&(!to||(r.date&&r.date.slice(0,10)<=to))})
}
export async function readRows(read,version,collection,ids){
 const pages=[...new Set(ids.map(i=>Math.floor(i/PAGE_SIZE)))];
 const loaded=new Map(),queue=[...pages]
 await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{while(queue.length){const page=queue.shift();loaded.set(page,await read(`${version}/${collection}/${page}.json`))}}))
 return ids.map(i=>loaded.get(Math.floor(i/PAGE_SIZE))[i%PAGE_SIZE])
}
export async function queryEcosystem(read,section,params){
 const manifest=await read('manifest.json'),version=manifest.version
 if(params.get('version')&&params.get('version')!==version)return {status:409,body:{error:'Evidence snapshot changed. Reload this view.'}}
 const fy=params.get('fy');if(fy&&fy!=='all'&&fy!=='unassigned'&&!/^(19|20|21)\d{2}$/.test(fy))throw Error('Invalid fiscal year')
 if(fy&&fy!=='all'&&!manifest.temporalIndexVersion)throw Error('Fiscal-year indexes are refreshing. Retry shortly.')
 const meta={version,fy:fy||'all',fiscalYears:manifest.fiscalYears||[],dateCoverage:manifest.dateCoverage,generatedAt:manifest.generatedAt,governmentCoverage:manifest.governmentCoverage,marylandBudgetCoverage:manifest.marylandBudgetCoverage,nonprofitCoverage:manifest.nonprofitCoverage,transactionalCoverage:manifest.transactionalCoverage}
 if(section==='overview')return {body:{...meta,...await read(`${version}/overview.json`)}}
 if(section==='funding'){
  const input=await read(`${version}/funding.json`),asOf=params.get('asOf')||new Date().toISOString().slice(0,10)
  if(!validDate(asOf))throw new Error('Invalid evidence cutoff')
  const scope=params.get('scope')||'reviewed',stage=params.get('stage')||'all',sort=params.get('sort')||'stage',q=normalize(params.get('q'))
  if(!['all','reviewed','portal'].includes(scope)||!['all','seed','a','later','unknown'].includes(stage)||!['stage','amount'].includes(sort)||q.length>128)throw new Error('Invalid funding filters')
  const reviewed=new Set(input.research.map(r=>companyKey(r.recipient)))
  const cohort=compileFunding(input.organizations,input.financing,input.research,asOf).filter(c=>scope==='all'||(scope==='portal'?c.portal:reviewed.has(companyKey(c.name))))
  const visible=cohort.filter(c=>normalize(c.name).includes(q)&&(stage==='all'||(stage==='seed'?c.stageRank>0&&c.stageRank<=2:stage==='a'?c.stageRank===3:stage==='later'?c.stageRank>3:c.stageRank===0))).sort((a,b)=>sort==='amount'?(b.largest?.amount||0)-(a.largest?.amount||0)||a.name.localeCompare(b.name):b.stageRank-a.stageRank||(b.largest?.amount||0)-(a.largest?.amount||0)||a.id.localeCompare(b.id))
  if(params.get('format')==='csv')return {csv:fundingCsv(visible)}
  const offset=integer(params,'offset',0,1e7),limit=integer(params,'limit',25,MAX_PAGE);if(!limit)throw new Error('Invalid limit')
  return {body:{...meta,total:visible.length,cohortTotal:cohort.length,summary:fundingSummary(cohort),records:visible.slice(offset,offset+limit),offset,nextOffset:offset+limit<visible.length?offset+limit:null}}
 }
 if(!['relationships','events','organizations','nonprofits','performance','graph'].includes(section))return {status:404,body:{error:'Unknown ecosystem view'}}
 const graph=section==='graph',collection=graph?'organizations':section==='organizations'?'directory':section
 const index=await read(`${version}/${collection}/index.json`)
 if(index.shards&&!graph){
  const offset=integer(params,'offset',0,1e7),limit=integer(params,'limit',50,MAX_PAGE);if(!limit)throw new Error('Invalid limit')
  const q=normalize(params.get('q'));if(q.length>128)throw new Error('Search is limited to 128 characters')
  const scoped=new URLSearchParams(params);scoped.delete('q');let total=0;const selected=[]
  // Scan bounded search shards; retain only IDs for the requested result page.
  for(const shard of index.shards){
   const part=await read(`${version}/${shard.path}`)
   for(const i of matching(part,scoped))if(!q||part.rows[i].search.includes(q)){
    if(total>=offset&&selected.length<limit)selected.push(shard.start+i)
    total++
   }
  }
  return {body:{...meta,records:await readRows(read,version,collection,selected),total,offset,nextOffset:offset+limit<total?offset+limit:null}}
 }
 const q=normalize(params.get('q'));if(q.length>128)throw new Error('Search is limited to 128 characters')
 index.grams={}
 const selectedGrams=grams(q).sort((a,b)=>(index.gramCounts[a]||0)-(index.gramCounts[b]||0)).slice(0,3)
 for(const bucket of new Set(selectedGrams.filter(g=>index.gramCounts[g]).map(gramBucket)))Object.assign(index.grams,await read(`${version}/${collection}/grams-${bucket}.json`))
 const nodeParams=new URLSearchParams(params);if(graph)for(const key of ['kind','from','to'])nodeParams.delete(key)
 let ids=matching(index,nodeParams)
 if(section==='performance'){
  const view=params.get('view')||'reviewed',cohort=params.get('cohort')||manifest.performance.cohorts[0]||''
  if(!['reviewed','strongest','shortfalls','exposure','unassessed'].includes(view))throw new Error('Invalid performance view')
  ids=ids.filter(i=>{const r=index.rows[i];return view==='unassessed'?!r.assessment:view==='exposure'?!r.assessment&&r.program==='Federal grants':r.assessment&&r.cohort===cohort&&(view!=='strongest'||r.meetsTarget)&&(view!=='shortfalls'||!r.meetsTarget)})
  ids.sort((a,b)=>{const x=index.rows[a],y=index.rows[b];return x.assessment&&y.assessment?(view==='shortfalls'?1:-1)*compareAttainment(x,y)||x.id.localeCompare(y.id):y.amount-x.amount||x.id.localeCompare(y.id)})
 }
 if(graph){
  const topology=fiscalTopology(await read(`${version}/topology.json`),fy),nodeId=value=>typeof value==='number'?topology.nodeIds[value]:value,selected=params.get('org'),depth=integer(params,'depth',1,3)
  if(fy&&fy!=='all')ids=ids.filter(i=>index.rows[i].id===selected||(topology.degree[index.rows[i].id]||0)>0)
  const mode=params.get('mode')||'network',geographic=mode==='geography'
  const direction=params.get('direction')||'both'
  if(!['both','parents','children'].includes(direction))throw new Error('Invalid relationship direction')
  const edgeAllowed=e=>fiscalMatches(e[4],fy)&&(!params.get('kind')||e[2]===params.get('kind'))&&(!params.get('from')||(e[3]&&e[3]>=params.get('from')))&&(!params.get('to')||(e[3]&&e[3].slice(0,10)<=params.get('to')))
  if(!['network','funding','geography'].includes(mode))throw new Error('Invalid graph mode')
  // Validate dates even though node membership itself is not dated.
  matching({rows:[],filters:{},grams:{}},new URLSearchParams({from:params.get('from')||'',to:params.get('to')||''}))
  let bbox=null
  if(params.has('bbox')){bbox=params.get('bbox').split(',').map(Number);if(bbox.length!==4||bbox.some(n=>!Number.isFinite(n))||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[0]<-180||bbox[2]>180||bbox[1]<-90||bbox[3]>90)throw new Error('Invalid map bounds')}
  if(geographic){
   ids=ids.filter(i=>{const r=index.rows[i];return Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&(!bbox||(r.longitude>=bbox[0]&&r.latitude>=bbox[1]&&r.longitude<=bbox[2]&&r.latitude<=bbox[3]))})
   if((!fy||fy==='all')&&!selected&&!params.get('county')&&!params.get('municipality')&&(!bbox||bbox[2]-bbox[0]>1)){
    const clusters=topology.geography.clusters.filter(c=>!bbox||(c.bounds[2]>=bbox[0]&&c.bounds[0]<=bbox[2]&&c.bounds[3]>=bbox[1]&&c.bounds[1]<=bbox[3]))
    return {body:{...meta,metricMax:manifest.metricMax,organizations:clusters,relationships:[],financing:[],clustered:true,geography:topology.geography,total:ids.length,totalOrganizations:manifest.totals.organizations,totalRelationships:manifest.totals.relationships,offset:0,nextOffset:null,matchingEdges:0,truncated:false,groups:manifest.groups}}
   }
  }
  if(!depth)throw new Error('Invalid depth')
  const offset=integer(params,'offset',0,1e7)
  const nodeLimit=integer(params,'nodeLimit',25,MAX_NODES);if(!nodeLimit)throw new Error('Invalid nodeLimit')
  let neighborhood
  const distances=new Map(selected?[[selected,0]]:[])
  if((!fy||fy==='all')&&params.get('summary')==='community'&&!selected&&!geographic&&mode==='network'&&!['q','community','category','county','municipality','kind','from','to'].some(key=>params.get(key))){
   const rankedClusters=topology.overview.organizations.filter(o=>!isNotApplicableNode(o)),clusters=rankedClusters.slice(offset,offset+MAX_NODES),visible=new Set(clusters.map(o=>o.id)),links=topology.overview.relationships.filter(e=>visible.has(e.source)&&visible.has(e.target))
   return {body:{...meta,metricMax:{connections:Math.max(1,...topology.overview.organizations.map(o=>o.count))},organizations:clusters,relationships:links.slice(0,MAX_EDGES),financing:[],communityOverview:true,total:rankedClusters.length,totalOrganizations:manifest.totals.organizations,totalRelationships:manifest.totals.relationships,offset,nextOffset:offset+MAX_NODES<rankedClusters.length?offset+MAX_NODES:null,matchingEdges:links.length,truncated:links.length>MAX_EDGES,groups:manifest.groups}}
  }
  // An org selects an indexed neighborhood, not just its own directory row.
  if(selected){
   if(!topology.adjacency[selected])throw new Error('Unknown organization')
   neighborhood=graphNeighborhood(topology,selected,depth,direction,edgeAllowed)
   const seen=neighborhood.nodes
   for(const [id,distance] of neighborhood.distances)distances.set(id,distance)
   const scoped=new URLSearchParams(nodeParams);scoped.delete('org');ids=matching(index,scoped).filter(i=>seen.has(index.rows[i].id))
   if(geographic)ids=ids.filter(i=>{const r=index.rows[i];return Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&(!bbox||(r.longitude>=bbox[0]&&r.latitude>=bbox[1]&&r.longitude<=bbox[2]&&r.latitude<=bbox[3]))})
   ids.sort((a,b)=>Number(index.rows[b].id===selected)-Number(index.rows[a].id===selected)||topology.degree[index.rows[b].id]-topology.degree[index.rows[a].id]||index.rows[a].id.localeCompare(index.rows[b].id))
  }else if(!['community','category','county','municipality'].some(key=>params.get(key))){
   // Stable breadth across communities; do not take the first arbitrary nodes.
   ids.sort((a,b)=>index.rows[a].rank-index.rows[b].rank||index.rows[a].id.localeCompare(index.rows[b].id))
  }
  let fundingCategoryIds=null
  if(mode==='funding'){
   const selectedIds=selected?new Set(ids):null
   const categoryIds=params.get('category')?new Set(index.filters.category?.[params.get('category')]?.map(i=>index.rows[i].id)||[]):null
   fundingCategoryIds=categoryIds
   const endpoints=new Set(topology.edges.filter(e=>fiscalMatches(e[4],fy)&&['transfer','grant','donation','contract','appropriation'].includes(e[2])&&(!params.get('kind')||e[2]===params.get('kind'))&&(!categoryIds||categoryIds.has(nodeId(e[0]))||categoryIds.has(nodeId(e[1])))&&(!params.get('from')||(e[3]&&e[3]>=params.get('from')))&&(!params.get('to')||(e[3]&&e[3].slice(0,10)<=params.get('to')))).flatMap(e=>[nodeId(e[0]),nodeId(e[1])]))
   const membership=new URLSearchParams(nodeParams);membership.delete('category');membership.delete('org');ids=matching(index,membership).filter(i=>endpoints.has(index.rows[i].id)&&(!selectedIds||selectedIds.has(i)))
  }
  const ranked=graphRelevance(index,topology,ids,selected,distances,offset+nodeLimit);ids=ranked.ids
  const included=params.get('include'),includedIndex=included&&included!==selected?ids.findIndex(i=>index.rows[i].id===included):-1
  if(selected&&includedIndex>0){const [context]=ids.splice(includedIndex,1);ids.splice(1,0,context)}
  const page=ids.slice(offset,offset+nodeLimit)
  // Every neighborhood page carries its anchor so its directed edges remain renderable.
  if(selected&&!page.some(i=>index.rows[i].id===selected)){const anchor=index.rows.findIndex(r=>r.id===selected);if(anchor>=0)page.unshift(anchor)}
  const organizations=(await readRows(read,version,'organizations',page)).map((org,i)=>({...org,relevance:{...ranked.scores.get(page[i]),rank:offset+i+1}}))
  if(fy&&fy!=='all'){
   const supported=fy==='unassigned'||(manifest.fiscalYears||[]).map(String).includes(fy),metrics=new Map()
   if(supported)for(const shard of new Set(page.map(i=>Math.floor(i/100))))metrics.set(shard,await read(`${version}/fiscal/${fy}/metrics/${shard}.json`))
   organizations.forEach((org,i)=>{org.networkMetrics=metrics.get(Math.floor(page[i]/100))?.[page[i]%100]||{totals:{received:0,disbursed:0},incoming:0,outgoing:0,counterparties:{},recordCount:0,connections:0,fiscalYear:fy}})
  }
  const visible=new Set(organizations.map(o=>o.id)),edgeIds=new Set()
  for(const id of visible)for(const edge of topology.edgesByOrg[id]||[])edgeIds.add(edge)
  const candidates=[...edgeIds].sort((a,b)=>a-b).filter(i=>{const e=topology.edges[i];return fiscalMatches(e[4],fy)&&visible.has(nodeId(e[0]))&&visible.has(nodeId(e[1]))&&(!neighborhood?.edges||neighborhood.edges.has(i))&&(mode!=='funding'||(['transfer','grant','donation','contract','appropriation'].includes(e[2])&&(!fundingCategoryIds||fundingCategoryIds.has(nodeId(e[0]))||fundingCategoryIds.has(nodeId(e[1])))))&&(!params.get('kind')||e[2]===params.get('kind'))&&(!params.get('from')||(e[3]&&e[3]>=params.get('from')))&&(!params.get('to')||(e[3]&&e[3].slice(0,10)<=params.get('to')))})
  if(selected)candidates.sort((a,b)=>Number(nodeId(topology.edges[b][0])===selected||nodeId(topology.edges[b][1])===selected)-Number(nodeId(topology.edges[a][0])===selected||nodeId(topology.edges[a][1])===selected)||a-b)
  const spread=spreadTransactionRows(candidates,topology)
  const edgeOffset=integer(params,'edgeOffset',0,1e7)
  const detail=params.get('detail')||'full';if(!['summary','full'].includes(detail))throw Error('Invalid graph detail')
  const recordLimit=integer(params,'recordLimit',MAX_EDGES,MAX_EDGES);if(!recordLimit)throw Error('Invalid record limit')
  const rows=await readRows(read,version,'graph',spread.rows.slice(edgeOffset,edgeOffset+recordLimit))
  const relationships=detail==='summary'?rows.map(row=>graphSummary(fy&&fy!=='all'&&row.annualAmountEligible===false?{...row,amount:undefined,amountLabel:'Cumulative/lifetime amount; excluded from FY totals'}:row)):rows
  const body={...meta,direction,metricMax:manifest.metricMax,geography:geographic?{located:topology.geography.located,missing:topology.geography.missing}:undefined,organizations,relationships,financing:[],nodeLimit,neighborhood:selected?{direction,depth}:undefined,ranking:{basis:selected?'selected-neighborhood':'connected-counterparties',selected:selected||null,description:selected?'Nearest neighbors, then transactions with the selected node, shared counterparties, and overall connectivity.':'Start at the most connected organization, then grow through the most connected counterparties; transaction count breaks ties.'},total:ids.length,totalOrganizations:manifest.totals.organizations,totalRelationships:manifest.totals.relationships,offset,nextOffset:offset+nodeLimit<ids.length?offset+nodeLimit:null,edgeOffset,nextEdgeOffset:null,matchingEdges:candidates.length,matchingLinks:spread.pairs,truncated:false,groups:manifest.groups}
  if(params.get('evidenceOnly')==='1'){body.organizations=[];body.groups={}}
  // The source table remains complete; bound graph response bytes as well as edge counts.
  let budget=2*1024*1024-new TextEncoder().encode(JSON.stringify({...body,relationships:[]})).byteLength-1024
  const bounded=[]
  for(const edge of relationships){const bytes=new TextEncoder().encode(JSON.stringify(edge)).byteLength+1;if(bytes>budget){body.truncated=true;break}budget-=bytes;bounded.push(edge)}
  body.relationships=bounded
  body.nextEdgeOffset=edgeOffset+bounded.length<candidates.length?edgeOffset+bounded.length:null
  body.truncated=edgeOffset>0||body.nextEdgeOffset!==null
  return {body}

 }
 const offset=integer(params,'offset',0,1e7),limit=integer(params,'limit',50,MAX_PAGE);if(!limit)throw new Error('Invalid limit')
 const rows=await readRows(read,version,collection,ids.slice(offset,offset+limit))
 return {body:{...meta,...(section==='performance'?manifest.performance:{}),records:section==='organizations'?rows.map(({id,name,type})=>({id,name,type})):rows,total:ids.length,offset,nextOffset:offset+limit<ids.length?offset+limit:null}}
}
export async function ecosystemResponse(request,read){
 const url=new URL(request.url),section=url.pathname.split('/').pop()
 if(request.method!=='GET'&&request.method!=='HEAD')return Response.json({error:'Use GET'},{status:405,headers:{Allow:'GET, HEAD'}})
 try{
  const result=await queryEcosystem(read,section,url.searchParams),status=result.status||200
  const headers={'Cache-Control':status===200?'public, max-age=60, must-revalidate':'no-store','X-Content-Type-Options':'nosniff'}
  if(result.csv!==undefined)return new Response(request.method==='HEAD'?null:result.csv,{headers:{...headers,'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment; filename="company-funding.csv"'}})
  if(result.body.version)headers['X-Ecosystem-Version']=result.body.version
  return new Response(request.method==='HEAD'?null:JSON.stringify(result.body),{status,headers:{...headers,'Content-Type':'application/json'}})
 }catch(error){
  const invalid=/^Invalid |^Unknown organization|^Search is limited/.test(error.message)
  return Response.json({error:invalid?error.message:'Public evidence index unavailable'},{status:invalid?400:503,headers:{'Cache-Control':'no-store'}})
 }
}
