import test from 'node:test'
import assert from 'node:assert/strict'
import {readTopology,writePackedTopology} from './topology.mjs'
import {fiscalTopology} from '../src/features/ecosystem/transaction-time.js'
import {graphNeighborhood} from '../src/features/ecosystem/graph-neighborhood.js'
const fixture=()=>({nodeIds:['a','b','c'],edges:[[0,1,'obligation','2024-10-01',2025],[0,1,'obligation','2025-10-01',2026],[1,2,'transfer','2025-01-02',2025]],adjacency:{a:[1],b:[0,2],c:[1]},degree:{a:1,b:2,c:1},edgesByOrg:{a:[0,1],b:[0,1,2],c:[2]},organizationLinks:[],organizationLinksByOrg:{}})
test('packed topology preserves every transaction index, exact date, fiscal year and directed traversal across shards',async()=>{
 const data=fixture(),files=new Map();await writePackedTopology(data,async(path,value)=>files.set(path,structuredClone(value)),{shardSize:2})
 const calls=[];const read=async path=>{calls.push(path);return files.get(path.replace('v/',''))}
 const [topology,concurrent]=await Promise.all([readTopology(read,'v'),readTopology(read,'v')]);assert.equal(concurrent,topology)
 assert.deepEqual([...topology.edges],data.edges);assert.deepEqual(topology.edges[2],data.edges[2]);assert.equal(topology.edges[3],undefined)
 assert.deepEqual(topology.edges.filter(e=>e[4]===2025),[data.edges[0],data.edges[2]])
 assert.deepEqual(topology.edges.map(e=>e[2]),data.edges.map(e=>e[2]));assert.deepEqual(topology.adjacency,data.adjacency)
 assert.deepEqual([...graphNeighborhood(topology,'a',2,'children').nodes],['a','b','c'])
 const year=fiscalTopology(topology,'2026');assert.deepEqual(year.edgesByOrg.a,[1]);assert.equal(year.degree.c,0)
 assert.equal(await readTopology(read,'v'),topology);assert.equal(calls.filter(p=>p.includes('/edges-')).length,2)
})
test('legacy snapshots work, failed shards are retryable, and artifact stores remain isolated',async()=>{
 const old=fixture();assert.equal(await readTopology(async()=>old,'old'),old)
 const files=new Map();await writePackedTopology(old,async(p,v)=>files.set(p,v),{shardSize:2})
 let fail=true;const read=async p=>{if(p.endsWith('edges-1.json')&&fail)throw Error('temporary outage');return files.get(p.replace('v/',''))}
 await assert.rejects(readTopology(read,'v'),/temporary/);fail=false;assert.equal((await readTopology(read,'v')).edges.length,3)
 await assert.rejects(readTopology(async p=>p.endsWith('topology.json')?files.get('topology.json'):[], 'v'),/Invalid topology edge shard/)
})
test('half a million source records stay in bounded assets without dropping or combining evidence',async()=>{
 const count=500000,edges=Array.from({length:count},(_,i)=>[0,1,'obligation',i%2?'2025-10-01':'2024-10-01',i%2?2026:2025]),indices=edges.map((_,i)=>i)
 const data={nodeIds:['a','b'],edges,adjacency:{a:[1],b:[0]},degree:{a:1,b:1},edgesByOrg:{a:indices,b:indices}},files=new Map()
 await writePackedTopology(data,async(p,v)=>{assert.ok(Buffer.byteLength(JSON.stringify(v))<16*1024*1024,p);files.set(p,v)})
 const topology=await readTopology(async p=>files.get(p.replace('v/','')),'v')
 assert.equal(topology.edges.length,count);assert.deepEqual(topology.edges[count-1],edges[count-1]);assert.equal(topology.edgesByOrg.b.length,count)
})

test('production asset readers reuse decoded topology across requests but refresh manifests and isolate bindings',async()=>{
 const {publicEvidenceReader}=await import('./public-artifacts.mjs'),files=new Map()
 await writePackedTopology(fixture(),async(p,v)=>files.set(p,v),{shardSize:2})
 let version='v',loads=0,manifests=0
 const assets={fetch:async request=>{const path=new URL(request.url).pathname.split('/query/')[1];if(path==='manifest.json'){manifests++;return Response.json({version})}loads++;return Response.json(files.get(path.replace(/^[^/]+\//,'')))}}
 const read=publicEvidenceReader(assets),first=await readTopology(read,'v')
 assert.equal(publicEvidenceReader(assets),read);assert.equal(await readTopology(publicEvidenceReader(assets),'v'),first);assert.equal(loads,3)
 assert.equal((await read('manifest.json')).version,'v');version='next';assert.equal((await publicEvidenceReader(assets)('manifest.json')).version,'next');assert.equal(manifests,2)
 assert.notEqual(await readTopology(read,'next'),first);assert.equal(loads,6)
 const other=publicEvidenceReader({...assets});assert.notEqual(other,read);assert.notEqual(await readTopology(other,'next'),first)
})
