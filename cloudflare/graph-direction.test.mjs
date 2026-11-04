import test from 'node:test'
import assert from 'node:assert/strict'
import {queryEcosystem,ecosystemResponse,MAX_NODES} from '../web/server/ecosystem-query.mjs'
import {directionFixture} from '../web/scripts/graph-direction-fixture.mjs'
const graph=async(params,fixture=directionFixture())=>(await queryEcosystem(fixture.read,'graph',new URLSearchParams({org:'b',...params}))).body
const ids=body=>body.organizations.map(o=>o.id).sort()
test('incoming parents and outgoing children are distinct, keeping the selected node',async()=>{
 assert.deepEqual(ids(await graph({direction:'parents'})),['a','b','d'])
 assert.deepEqual(ids(await graph({direction:'children'})),['b','g0'])
 const parents=await graph({direction:'parents'});assert(parents.relationships.every(r=>r.target==='b'))
 const children=await graph({direction:'children'});assert(children.relationships.every(r=>r.source==='b'))
 assert.deepEqual(ids(await graph({direction:'both'})),['a','b','d','g0'])
})
test('direction is applied before page limits and remains fixed across hops',async()=>{
 assert.deepEqual(ids(await graph({direction:'parents'},directionFixture(300))),['a','b','d'])
 assert.equal((await graph({direction:'children',nodeLimit:String(MAX_NODES)},directionFixture(300))).organizations.length,MAX_NODES)
 assert.deepEqual(ids(await graph({direction:'parents',depth:'2'})),['a','b','d','e'])
 assert.deepEqual(ids(await graph({org:'d',direction:'parents'})),['d'])
})
test('invalid direction is rejected and snapshot pinning is preserved',async()=>{
 const {read}=directionFixture()
 const bad=await ecosystemResponse(new Request('https://example.test/api/ecosystem/graph?org=b&direction=sideways'),read)
 assert.equal(bad.status,400)
 const stale=await ecosystemResponse(new Request('https://example.test/api/ecosystem/graph?org=b&direction=parents&version=old'),read)
 assert.equal(stale.status,409)
})
test('compressed topology IDs, cycles and reciprocal links keep their recorded direction',async()=>{
 const {graphNeighborhood}=await import('../web/src/features/ecosystem/graph-neighborhood.js')
 const topology={nodeIds:['a','b','c'],edges:[[0,1],[1,0],[1,2],[0,0]],adjacency:{a:[1],b:[0,2],c:[1]},edgesByOrg:{a:[0,1,3],b:[0,1,2],c:[2]}}
 const parents=graphNeighborhood(topology,'b',3,'parents')
 assert.deepEqual([...parents.nodes].sort(),['a','b']);assert.deepEqual([...parents.edges],[0])
 const children=graphNeighborhood(topology,'b',1,'children')
 assert.deepEqual([...children.nodes].sort(),['a','b','c']);assert.deepEqual([...children.edges],[1,2])
})

test('context child survives pagination without admitting unrelated or incoming nodes',async()=>{
 const fixture=directionFixture(300)
 const included=await graph({direction:'children',nodeLimit:'2',include:'g299'},fixture)
 assert.deepEqual(ids(included),['b','g299'])
 assert(included.relationships.some(r=>r.source==='b'&&r.target==='g299'))
 assert(!ids(await graph({direction:'children',include:'e'},fixture)).includes('e'))
 assert(!ids(await graph({direction:'parents',include:'g299'},fixture)).includes('g299'))
})
