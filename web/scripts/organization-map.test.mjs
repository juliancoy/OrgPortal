import test from 'node:test'
import assert from 'node:assert/strict'
import {queryEcosystem} from '../server/ecosystem-query.mjs'
import {directionFixture} from './graph-direction-fixture.mjs'
function fixture(count=1){
 const source=directionFixture(count)
 const read=async path=>{
  if(path==='manifest.json')return {...await source.read(path),organizationEvidenceIndexVersion:1}
  if(path.endsWith('/organization-evidence/index.json'))return {beta:0,b:0,ambiguous:null}
  if(path.endsWith('/organization-evidence/0.json'))return [{organization:{id:'b',name:'Beta',slug:'beta'}}]
  return source.read(path)
 }
 return {...source,read}
}
const query=async(read,params={})=>(await queryEcosystem(read,'organization-map',new URLSearchParams({org:'beta',...params})))
test('direct map includes incoming and outgoing neighbors, excludes second-hop nodes, and resolves an exact slug',async()=>{
 const {read}=fixture(),{body}=await query(read)
 assert.equal(body.anchor,'b');assert.equal(body.total,3);assert.equal(body.incoming,2);assert.equal(body.outgoing,1)
 assert.deepEqual(body.organizations.map(o=>o.id).sort(),['a','b','d','g0'])
 assert(!body.organizations.some(o=>o.id==='e'));assert(body.relationships.every(e=>e.source==='b'||e.target==='b'))
})
test('neighborhood pagination keeps its anchor and exposes every neighbor above the graph cap',async()=>{
 const {read}=fixture(600),nodes=new Set(),pairs=new Set();let offset=0
 do {const {body}=await query(read,{offset:String(offset),limit:'250'});assert.equal(body.total,602);assert(body.organizations.some(o=>o.id==='b'));for(const o of body.organizations)nodes.add(o.id);for(const e of body.relationships)pairs.add(e.id);offset=body.nextOffset}while(offset!==null)
 assert.equal(nodes.size,603);assert.equal(pairs.size,602)
})
test('a single map page reads only its visible organization detail shards',async()=>{
 const f=fixture(600),calls=[]
 const read=async key=>{calls.push(key);return f.read(key)}
 const {body}=await query(read,{limit:'1'})
 assert.equal(body.organizations.length,2)
 assert(calls.filter(key=>/\/organizations\/\d+\.json$/.test(key)).length<=2,'hidden detail shards must remain lazy')
})
test('node volume uses the master financial metric, preserving missing and zero without summing pair counts',async()=>{
 const f=fixture()
 f.organizations.find(n=>n.id==='a').networkMetrics.amount=123456
 f.organizations.find(n=>n.id==='b').networkMetrics.amount=0
 f.organizations.find(n=>n.id==='d').networkMetrics.amount=-5
 const {body}=await query(f.read)
 assert.equal(body.organizations.find(n=>n.id==='a').financialAmount,123456)
 assert.equal(body.organizations.find(n=>n.id==='b').financialAmount,0)
 assert.equal(body.organizations.find(n=>n.id==='d').financialAmount,null)
 assert.equal(body.organizations.find(n=>n.id==='g0').financialAmount,null)
})
test('received amounts use indexed cash receipts for the selected year and the grouped focus total',async()=>{
 const f=fixture(),calls=[]
 f.organizations.forEach(org=>{org.networkMetrics.amount=999999})
 f.organizations.find(org=>org.id==='a').networkMetrics.receivedUsd=123
 f.organizations.find(org=>org.id==='d').networkMetrics.receivedUsd=-5
 f.topology.edges=f.topology.edges.map(e=>[...e,null,2025])
 const read=async path=>{
  calls.push(path)
  if(path==='manifest.json')return {...await f.read(path),temporalIndexVersion:1,fiscalYears:[2025]}
  if(path.endsWith('/organization-evidence/0.json'))return [{organization:{id:'b',name:'Beta',slug:'beta'},recordKinds:{},recordIndices:[],recordFiscalYears:{},financialTotals:{currencies:[{currency:'USD',received:37,disbursed:999}],missingAmounts:0},financialTotalsByYear:{2025:{currencies:[{currency:'USD',received:12,disbursed:900}],missingAmounts:0}}}]
  if(path.endsWith('/fiscal/2025/metrics/0.json'))return f.organizations.map(org=>({amount:99999,receivedUsd:org.id==='a'?8:org.id==='d'?-2:null}))
  return f.read(path)
 }
 const all=(await query(read)).body.organizations,year=(await query(read,{fy:'2025'})).body.organizations
 assert.equal(all.find(n=>n.id==='a').receivedUsd,123);assert.equal(year.find(n=>n.id==='a').receivedUsd,8)
 assert.equal(all.find(n=>n.id==='b').receivedUsd,37);assert.equal(year.find(n=>n.id==='b').receivedUsd,12)
 assert.equal(all.find(n=>n.id==='d').receivedUsd,-5);assert.equal(year.find(n=>n.id==='d').receivedUsd,-2)
 assert.equal(all.find(n=>n.id==='g0').receivedUsd,null)
 assert(!calls.some(path=>/\/relationships\/\d+/.test(path)),'labels do not fetch transaction details per node')
})
test('reciprocal links and repeated records retain separate directions, with compressed endpoint IDs',async()=>{
 const f=fixture();f.topology.nodeIds=f.organizations.map(o=>o.id)
 f.topology.edges.push(['b','a','transfer'],['a','b','approval'],['b','b','transfer']);f.topology.edgesByOrg.b.push(4,5,6)
 f.topology.edges=f.topology.edges.map(([s,t,k])=>[f.topology.nodeIds.indexOf(s),f.topology.nodeIds.indexOf(t),k])
 const {body}=await query(f.read)
 assert.equal(body.incoming,2);assert.equal(body.outgoing,2);assert.equal(body.total,3)
 assert.equal(body.relationships.find(e=>e.source==='a'&&e.target==='b').recordCount,2)
 assert.deepEqual(body.relationships.find(e=>e.source==='a'&&e.target==='b').kinds,['agency','approval'])
 assert.equal(body.relationships.find(e=>e.source==='b'&&e.target==='a').recordCount,1)
})
test('unknown, ambiguous, invalid and changing snapshots fail safely without name matching',async()=>{
 const {read}=fixture();assert.equal((await query(read,{org:'Beta'})).body.anchor,null)
 await assert.rejects(query(read,{org:'ambiguous'}),/ambiguous/)
 await assert.rejects(query(read,{limit:'251'}),/Invalid limit/)
 await assert.rejects(query(read,{offset:'-1'}),/Invalid offset/)
 assert.equal((await query(read,{version:'old'})).status,409)
})
test('independent directed depths, cycles and cross-page edges remain complete and cache-isolated',async()=>{
 const f=fixture()
 const edge=(from,to)=>{const i=f.topology.edges.push([from,to,'transfer'])-1;for(const id of new Set([from,to]))f.topology.edgesByOrg[id].push(i)}
 // e -> a -> b -> g0 -> d -> e, including a cycle back to b through d.
 edge('g0','d');edge('d','e')
 const direct=(await query(f.read)).body
 const up=(await query(f.read,{parentDepth:'2'})).body
 assert.equal(direct.total,3);assert.equal(up.total,4);assert.equal(up.incoming,4);assert.equal(up.outgoing,1)
 const pages=[],nodes=new Set(),edges=new Map();let offset=0
 do{const {body}=await query(f.read,{parentDepth:'1',childDepth:'3',limit:'1',offset:String(offset)});pages.push(body);for(const node of body.organizations)nodes.add(node.id);for(const link of body.relationships){assert(nodes.has(link.source)&&nodes.has(link.target),'endpoints arrive no later than their edge');edges.set(link.id,link)}offset=body.nextOffset}while(offset!==null)
 const all=(await query(f.read,{parentDepth:'1',childDepth:'3'})).body
 assert.equal(all.outgoing,3);assert.equal(all.incoming,2);assert.equal(all.total,4)
 assert.deepEqual([...edges.keys()].sort(),all.relationships.map(e=>e.id).sort())
 assert(edges.has(JSON.stringify(['g0','d'])));assert(edges.has(JSON.stringify(['d','e'])))
 assert.equal((await query(f.read)).body.total,3,'deeper cached result must not replace default')
 for(const key of ['parentDepth','childDepth'])for(const value of ['0','4','-1','1.5','x'])await assert.rejects(query(f.read,{[key]:value}),new RegExp(`Invalid ${key}`))
})
test('deeper hierarchy remains undated; terms and transfers obey the year at every hop',async()=>{
 const f=fixture()
 f.topology.edges=f.topology.edges.map(e=>[e[0],e[1],'transfer',null,2024])
 f.topology.organizationLinks=[['a','b','hierarchy'],['e','a','hierarchy'],['b','g0','terms',null,2025],['g0','d','terms',null,2024]]
 f.topology.organizationLinksByOrg={a:[0,1],b:[0,2],e:[1],g0:[2,3],d:[3]}
 const read=async key=>key==='manifest.json'?{...await f.read(key),temporalIndexVersion:1}:f.read(key)
 const {body}=await query(read,{parentDepth:'3',childDepth:'3',fy:'2025'})
 assert.deepEqual(body.organizations.map(n=>n.id).sort(),['a','b','e','g0'])
 assert.equal(body.incoming,2);assert.equal(body.outgoing,1)
 assert.equal(body.relationships.filter(e=>e.hierarchy).length,2)
 assert.equal(body.relationships.find(e=>e.kinds.includes('terms')).recordCount,1)
})
