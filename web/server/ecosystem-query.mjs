import {compileFunding,companyKey,fundingSummary,fundingCsv} from '../src/features/ecosystem/fundingStatistics.ts'
import {compareAttainment} from '../src/features/ecosystem/performance.ts'

export const PAGE_SIZE=25, MAX_PAGE=100, MAX_NODES=250, MAX_EDGES=1000
export const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().trim()
export const grams=value=>[...new Set(Array.from({length:Math.max(0,value.length-2)},(_,i)=>value.slice(i,i+3)))]
const integer=(params,key,fallback,max)=>{const raw=params.get(key);if(raw===null)return fallback;if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>max)throw new Error(`Invalid ${key}`);return Number(raw)}
const intersect=(a,b)=>{const values=new Set(b);return a.filter(id=>values.has(id))}
export function matching(index,params){
 const q=normalize(params.get('q'));if(q.length>128)throw new Error('Search is limited to 128 characters')
 const pools=[]
 for(const key of ['org','kind','category','county','municipality','community'])if(params.get(key))pools.push(index.filters[key]?.[params.get(key)]||[])
 if(q.length>=3)for(const gram of grams(q))pools.push(index.grams[gram]||[])
 pools.sort((a,b)=>a.length-b.length)
 let ids=pools.length?[...pools[0]]:index.rows.map((_,i)=>i)
 for(const pool of pools.slice(1)){ids=intersect(ids,pool);if(!ids.length)break}
 const from=params.get('from'),to=params.get('to')
 if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))||(from&&to&&from>to))throw new Error('Invalid date range')
 return ids.filter(i=>{const r=index.rows[i];return (!q||r.search.includes(q))&&(!from||(r.date&&r.date>=from))&&(!to||(r.date&&r.date.slice(0,10)<=to))})
}
export async function readRows(read,version,collection,ids){
 const pages=[...new Set(ids.map(i=>Math.floor(i/PAGE_SIZE)))];
 const loaded=new Map(await Promise.all(pages.map(async page=>[page,await read(`${version}/${collection}/${page}.json`)])))
 return ids.map(i=>loaded.get(Math.floor(i/PAGE_SIZE))[i%PAGE_SIZE])
}
export async function queryEcosystem(read,section,params){
 const manifest=await read('manifest.json'),version=manifest.version
 if(params.get('version')&&params.get('version')!==version)return {status:409,body:{error:'Evidence snapshot changed. Reload this view.'}}
 const meta={version,generatedAt:manifest.generatedAt,governmentCoverage:manifest.governmentCoverage,nonprofitCoverage:manifest.nonprofitCoverage}
 if(section==='overview')return {body:{...meta,...await read(`${version}/overview.json`)}}
 if(section==='funding'){
  const input=await read(`${version}/funding.json`),asOf=params.get('asOf')||new Date().toISOString().slice(0,10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new Error('Invalid evidence cutoff')
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
 const graph=section==='graph',collection=graph?'organizations':section
 const index=await read(`${version}/${collection}/index.json`)
 const nodeParams=new URLSearchParams(params);if(graph)for(const key of ['kind','from','to'])nodeParams.delete(key)
 let ids=matching(index,nodeParams)
 if(section==='performance'){
  const view=params.get('view')||'reviewed',cohort=params.get('cohort')||manifest.performance.cohorts[0]||''
  if(!['reviewed','strongest','shortfalls','exposure','unassessed'].includes(view))throw new Error('Invalid performance view')
  ids=ids.filter(i=>{const r=index.rows[i];return view==='unassessed'?!r.assessment:view==='exposure'?!r.assessment&&r.program==='Federal grants':r.assessment&&r.cohort===cohort&&(view!=='strongest'||r.meetsTarget)&&(view!=='shortfalls'||!r.meetsTarget))})
  ids.sort((a,b)=>{const x=index.rows[a],y=index.rows[b];return x.assessment&&y.assessment?(view==='shortfalls'?1:-1)*compareAttainment(x,y)||x.id.localeCompare(y.id):y.amount-x.amount||x.id.localeCompare(y.id)})
 }
 if(graph){
  const topology=await read(`${version}/topology.json`),selected=params.get('org'),depth=integer(params,'depth',1,3)
  if(!depth)throw new Error('Invalid depth')
  // An org selects an indexed neighborhood, not just its own directory row.
  if(selected){
   if(!topology.adjacency[selected])throw new Error('Unknown organization')
   const seen=new Set([selected]);let frontier=[selected]
   for(let hop=0;hop<depth;hop++){const next=[];for(const id of frontier)for(const neighbor of topology.adjacency[id]||[])if(!seen.has(neighbor)){seen.add(neighbor);next.push(neighbor)}frontier=next}
   const scoped=new URLSearchParams(nodeParams);scoped.delete('org');ids=matching(index,scoped).filter(i=>seen.has(index.rows[i].id))
   ids.sort((a,b)=>Number(index.rows[b].id===selected)-Number(index.rows[a].id===selected)||topology.degree[index.rows[b].id]-topology.degree[index.rows[a].id]||index.rows[a].id.localeCompare(index.rows[b].id))
  }else if(!['community','category','county','municipality'].some(key=>params.get(key))){
   // Stable breadth across communities; do not take the first arbitrary nodes.
   ids.sort((a,b)=>index.rows[a].rank-index.rows[b].rank||index.rows[a].id.localeCompare(index.rows[b].id))
  }
  const offset=integer(params,'offset',0,1e7),page=ids.slice(offset,offset+MAX_NODES),organizations=await readRows(read,version,'organizations',page)
  const visible=new Set(organizations.map(o=>o.id)),edgeIds=new Set()
  for(const id of visible)for(const edge of topology.edgesByOrg[id]||[])edgeIds.add(edge)
  const candidates=[...edgeIds].sort((a,b)=>a-b).filter(i=>{const e=topology.edges[i];return visible.has(e[0])&&visible.has(e[1])&&(!params.get('kind')||e[2]===params.get('kind'))&&(!params.get('from')||(e[3]&&e[3]>=params.get('from')))&&(!params.get('to')||(e[3]&&e[3].slice(0,10)<=params.get('to')))})
  const relationships=await readRows(read,version,'graph',candidates.slice(0,MAX_EDGES))
  return {body:{...meta,organizations,relationships,financing:[],total:ids.length,totalOrganizations:manifest.totals.organizations,totalRelationships:manifest.totals.relationships,offset,nextOffset:offset+MAX_NODES<ids.length?offset+MAX_NODES:null,matchingEdges:candidates.length,truncated:candidates.length>MAX_EDGES,groups:manifest.groups}}
 }
 const offset=integer(params,'offset',0,1e7),limit=integer(params,'limit',50,MAX_PAGE);if(!limit)throw new Error('Invalid limit')
 return {body:{...meta,...(section==='performance'?manifest.performance:{}),records:await readRows(read,version,collection,ids.slice(offset,offset+limit)),total:ids.length,offset,nextOffset:offset+limit<ids.length?offset+limit:null}}
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
