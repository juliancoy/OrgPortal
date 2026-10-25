import {test,before} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {buildEcosystemQuery} from '../web/scripts/build-ecosystem-query.mjs'
import {queryEcosystem,ecosystemResponse,MAX_NODES,MAX_EDGES} from '../web/server/ecosystem-query.mjs'
const root=new URL('../web/public/ecosystem-data/query/',import.meta.url)
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'))
let manifest
before(async()=>{manifest=await buildEcosystemQuery()})
const query=(section,params={})=>queryEcosystem(read,section,new URLSearchParams(params)).then(r=>r.body)
test('indexed substring and organization queries agree with independent scans; pages do not overlap',async()=>{
 const index=await read(`${manifest.version}/relationships/index.json`)
 for(const q of ['tedco','grant','RED','a','zzzznonexistent']){
  const result=await query('relationships',{q,limit:'25'}),expected=index.rows.filter(r=>r.search.includes(q.toLowerCase()))
  assert.equal(result.total,expected.length);assert.deepEqual(result.records.map(r=>r.id),expected.slice(0,25).map(r=>r.id))
 }
 const org=Object.keys(index.filters.org).find(id=>index.filters.org[id].length>100)
 const one=await query('relationships',{org,limit:'50'}),two=await query('relationships',{org,limit:'50',offset:String(one.nextOffset),version:one.version})
 assert.equal(one.total,index.filters.org[org].length);assert(one.records.every(r=>r.source===org||r.target===org))
 assert.equal(new Set([...one.records,...two.records].map(r=>r.id)).size,100)
 assert.deepEqual((await query('relationships',{org:'__proto__'})).records,[])
})
test('graphs have hard limits, no dangling edges, stable global financial summaries and deterministic ordering',async()=>{
 const overview=await query('graph',{community:manifest.groups.community[0].id}),focus=await query('graph',{org:overview.organizations.find(o=>o.networkMetrics?.totals)?.id,depth:'3'})
 for(const graph of [overview,focus]){
  assert(graph.organizations.length<=MAX_NODES);assert(graph.relationships.length<=MAX_EDGES)
  const ids=new Set(graph.organizations.map(o=>o.id));assert(graph.relationships.every(e=>ids.has(e.source)&&ids.has(e.target)))
  assert.equal(graph.totalOrganizations,manifest.totals.organizations)
  assert(Buffer.byteLength(JSON.stringify(graph))<2*1024*1024,'graph payload under 2 MiB')
 }
 const common=overview.organizations.find(o=>focus.organizations.some(n=>n.id===o.id))
 assert.deepEqual(common.networkMetrics,focus.organizations.find(o=>o.id===common.id).networkMetrics)
 assert.deepEqual(overview.metricMax,focus.metricMax)
 const funding=await query('graph',{mode:'funding',kind:'transfer',org:focus.organizations[0].id});assert(funding.relationships.every(e=>e.kind==='transfer'));assert(funding.organizations.some(o=>o.id===focus.organizations[0].id))
 assert.deepEqual(overview.organizations.map(o=>o.id),(await query('graph',{community:manifest.groups.community[0].id})).organizations.map(o=>o.id))
})
test('map starts with county aggregates and narrows to published coordinates',async()=>{
 const overview=await query('graph',{mode:'geography'})
 assert(overview.clustered);assert(overview.organizations.every(o=>o.serverCluster&&Number.isFinite(o.latitude)))
 assert.equal(overview.organizations.reduce((s,o)=>s+o.count,0),overview.geography.located)
 const bounded=await query('graph',{mode:'geography',bbox:'-76.7,39.2,-76.5,39.4'})
 assert(bounded.organizations.every(o=>o.longitude>=-76.7&&o.longitude<=-76.5&&o.latitude>=39.2&&o.latitude<=39.4));assert(bounded.organizations.length<=MAX_NODES)
 await assert.rejects(()=>query('graph',{bbox:'not,bounds'}),/Invalid map bounds/)
})
test('summary totals cover full scope and preserve signed government obligations',async()=>{
 const one=await query('overview'),two=await query('overview',{offset:'100',limit:'1'});assert.deepEqual(one.stats,two.stats)
 const source=JSON.parse(await readFile(new URL('../web/public/ecosystem-data/ecosystem-government.json',import.meta.url),'utf8'))
 assert.equal(one.stats.governmentUsd,source.relationships.reduce((s,r)=>s+Math.round(r.amount*100),0)/100)
 const performance=await query('performance',{view:'unassessed',limit:'1'});assert(performance.total>performance.records.length);assert.equal(performance.federalCount,source.relationships.length)
 const funding=await query('funding',{scope:'all',limit:'1'}),filtered=await query('funding',{scope:'all',q:'zzzz-no-match',limit:'1'})
 assert.deepEqual(funding.summary,filtered.summary);assert.equal(filtered.total,0)
})
test('snapshot pinning, input validation, HEAD, errors and unsupported methods have explicit responses',async()=>{
 for(const [suffix,status] of [['relationships?version=old',409],['relationships?limit=101',400],['events?offset=-1',400],['events?from=bad',400],['events?from=2026-02-30',400],['graph?depth=4',400],['relationships?q='+('a'.repeat(129)),400],['unknown',404]]){
  const response=await ecosystemResponse(new Request('https://orgportal.cc/api/ecosystem/'+suffix),read);assert.equal(response.status,status,suffix);assert.equal(response.headers.get('cache-control'),'no-store')
 }
 const head=await ecosystemResponse(new Request('https://orgportal.cc/api/ecosystem/overview',{method:'HEAD'}),read);assert.equal(head.status,200);assert.equal(await head.text(),'');assert(head.headers.get('x-ecosystem-version'))
 const post=await ecosystemResponse(new Request('https://orgportal.cc/api/ecosystem/overview',{method:'POST'}),read);assert.equal(post.status,405)
 const missing=await ecosystemResponse(new Request('https://orgportal.cc/api/ecosystem/overview'),async()=>{throw Error('private details')});assert.equal(missing.status,503);assert(!(await missing.text()).includes('private details'))
})
test('record bounded endpoint benchmark receipts',async()=>{
 const receipt=[]
 for(const section of ['overview','relationships','events','organizations','nonprofits','funding','performance','graph']){
  const started=performance.now(),body=await query(section);receipt.push({section,ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(JSON.stringify(body)),records:body.records?.length??body.organizations?.length??0,total:body.total})
 }
 await mkdir(new URL('../artifacts/ecosystem-query/',import.meta.url),{recursive:true})
 await writeFile(new URL('../artifacts/ecosystem-query/api.json',import.meta.url),JSON.stringify({version:manifest.version,receipt},null,2));console.log(JSON.stringify(receipt))
})
