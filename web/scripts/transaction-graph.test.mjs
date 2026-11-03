import {test} from 'node:test'
import assert from 'node:assert/strict'
import {queryEcosystem,MAX_EDGES,PAGE_SIZE} from '../server/ecosystem-query.mjs'
import {assignEdgeCurvature} from '../src/features/ecosystem/ecosystem-physics.js'
import {transactionEdgePath,TRANSACTION_EDGE_SEGMENTS} from '../src/features/ecosystem/transaction-edge-path.js'
import {bundleRenderedEdges} from '../src/features/ecosystem/network-edge-bundles.js'
import {edgeBundleDetails} from '../src/features/ecosystem/ecosystem-view.js'

test('directed edge thickness follows row count power and retains mixed records for inspection',()=>{
 const rows=Array.from({length:16},(_,i)=>({id:`row:${i}`,source:{id:'a'},target:{id:'b'},sourceLabel:'Agency',targetLabel:'Recipient',kind:i?'transfer':'approval',quantityWidth:2,sourceUrl:'https://example.test/record',currency:'USD',amount:i}))
 const reverse={...rows[0],id:'reverse',source:{id:'b'},target:{id:'a'}}
 const bundles=bundleRenderedEdges([...rows,reverse],()=>123)
 assert.equal(bundles.length,2)
 assert.equal(bundles[0].quantityWidth,8)
 assert.equal(bundles[1].quantityWidth,2)
 assert.deepEqual(bundles[0].records,rows)
 assert.equal(bundles[0].kind,'mixed')
 assert.equal(bundles[0].amount,undefined)
 assert.equal(bundleRenderedEdges(rows,()=>123,1)[0].quantityWidth,32)
 const html=edgeBundleDetails(bundles[0],{})
 for(const row of rows)assert(html.includes(row.id))
 assert(html.includes('16 transaction rows'))
 assert(!edgeBundleDetails({...bundles[0],sourceLabel:'<script>',records:[...rows,{...rows[0],id:'<img onerror=bad>',sourceUrl:'javascript:alert(1)'}]},{}).includes('<script>'))
 assert(!edgeBundleDetails({...bundles[0],records:[{...rows[0],id:'<img onerror=bad>',sourceUrl:'javascript:alert(1)'},rows[1]]},{}).includes('javascript:'))
})

test('parallel transaction rows retain distinct bounded curves',()=>{
 const edges=Array.from({length:100},(_,i)=>({id:String(i),source:'a',target:'b'}))
 assignEdgeCurvature(edges,60)
 assert.equal(new Set(edges.map(e=>e.curveOffset)).size,edges.length)
 assert(edges.every(e=>Math.abs(e.curveOffset)<=60))
 const paths=edges.map(edge=>transactionEdgePath({...edge,source:{x:0,y:0,z:0,renderRadius:3},target:{x:100,y:0,z:50,renderRadius:3}}))
 assert.equal(new Set(paths.map(path=>JSON.stringify(path[TRANSACTION_EDGE_SEGMENTS/2]))).size,edges.length)
 for(const path of paths){assert.equal(path.length,TRANSACTION_EDGE_SEGMENTS+1);assert(path.every(point=>Object.values(point).every(Number.isFinite)))}
})

test('graph edges preserve individual transaction rows, direction and paging',async()=>{
 const organizations=[{id:'a',name:'Agency'},{id:'b',name:'Recipient'}]
 const records=Array.from({length:MAX_EDGES+3},(_,i)=>({id:`transaction:${i}`,source:i===1?'b':'a',target:i===1?'a':'b',kind:'transfer',relationship:'funding',amount:i-2,currency:'USD',sourceUrl:`https://example.test/record/${i}`}))
 const read=async path=>{
  if(path==='manifest.json')return {version:'fixture',generatedAt:'2026-11-02',totals:{organizations:2,relationships:records.length},groups:{},metricMax:{}}
  if(path.endsWith('organizations/index.json'))return {rows:organizations.map(n=>({...n,search:n.name.toLowerCase()})),filters:{},gramCounts:{}}
  if(path.endsWith('organizations/0.json'))return organizations
  if(path.endsWith('topology.json'))return {edges:records.map(r=>[r.source==='a'?0:1,r.target==='a'?0:1,r.kind]),nodeIds:['a','b'],adjacency:{a:[1],b:[0]},degree:{a:1,b:1},edgesByOrg:{a:records.map((_,i)=>i),b:records.map((_,i)=>i)}}
  const match=path.match(/graph\/(\d+)\.json$/)
  if(match)return records.slice(Number(match[1])*PAGE_SIZE,(Number(match[1])+1)*PAGE_SIZE)
  throw Error(`Unexpected fixture path: ${path}`)
 }
 const query=params=>queryEcosystem(read,'graph',new URLSearchParams(params)).then(r=>r.body)
 const first=await query({}),second=await query({edgeOffset:String(first.nextEdgeOffset)})
 assert.equal(first.communityOverview,undefined)
 assert.deepEqual(first.organizations.map(({relevance,...org})=>org),organizations)
 assert.deepEqual(first.relationships,records.slice(0,MAX_EDGES))
 assert.equal(first.matchingEdges,records.length)
 assert.equal(first.nextEdgeOffset,MAX_EDGES)
 assert.equal(second.nextEdgeOffset,null)
 assert.deepEqual([...first.relationships,...second.relationships],records)
 assert.equal(new Set([...first.relationships,...second.relationships].map(r=>r.id)).size,records.length)
 // A byte-limited page must resume at the next actual row, not skip to 1,000.
 for(const record of records)record.notes='x'.repeat(4000)
 const all=[];let edgeOffset=0,pages=0
 do{
  const page=await query({edgeOffset:String(edgeOffset)})
  assert(Buffer.byteLength(JSON.stringify(page))<2*1024*1024)
  assert(page.relationships.length>0)
  all.push(...page.relationships);edgeOffset=page.nextEdgeOffset;pages++
 }while(edgeOffset!==null)
 assert(pages>1)
 assert.deepEqual(all,records)
 await assert.rejects(()=>query({edgeOffset:'-1'}),/Invalid edgeOffset/)
})
