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
