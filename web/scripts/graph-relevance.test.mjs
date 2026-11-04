import {test} from 'node:test'
import assert from 'node:assert/strict'
import {queryEcosystem,PAGE_SIZE} from '../server/ecosystem-query.mjs'
import {graphRelevance} from '../server/graph-relevance.mjs'
const organizations='abcdefg'.split('').map(id=>({id,name:id,category:'general'}))
const links=[['a','b'],['a','c'],['a','c'],['a','c'],['c','d'],['b','e'],['b','f'],['b','g']]
const records=links.map(([source,target],i)=>({id:`row:${i}`,source,target,kind:'transfer',relationship:'funding'}))
const adjacency=Object.fromEntries(organizations.map(o=>[o.id,[]])),edgesByOrg=Object.fromEntries(organizations.map(o=>[o.id,[]]))
links.forEach(([a,b],i)=>{adjacency[a].push(b);adjacency[b].push(a);edgesByOrg[a].push(i);edgesByOrg[b].push(i)})
for(const id in adjacency)adjacency[id]=[...new Set(adjacency[id])]
const topology={nodeIds:organizations.map(o=>o.id),adjacency:Object.fromEntries(Object.entries(adjacency).map(([id,list])=>[id,list.map(n=>organizations.findIndex(o=>o.id===n))])),degree:Object.fromEntries(Object.entries(adjacency).map(([id,list])=>[id,list.length])),edgesByOrg,edges:links.map(([a,b])=>[organizations.findIndex(o=>o.id===a),organizations.findIndex(o=>o.id===b),'transfer'])}
const read=async path=>{
 if(path==='manifest.json')return {version:'relevance-fixture',generatedAt:'2026-11-02',totals:{organizations:7,relationships:8},groups:{},metricMax:{}}
 if(path.endsWith('organizations/index.json'))return {rows:organizations.map(o=>({...o,search:o.id})),filters:{org:Object.fromEntries(organizations.map((o,i)=>[o.id,[i]]))},gramCounts:{}}
 if(path.endsWith('topology.json'))return topology
 if(path.endsWith('organizations/0.json'))return organizations
 const match=path.match(/graph\/(\d+)\.json$/)
 if(match)return records.slice(Number(match[1])*PAGE_SIZE,(Number(match[1])+1)*PAGE_SIZE)
 throw Error(`Unexpected path ${path}`)
}
const graph=params=>queryEcosystem(read,'graph',new URLSearchParams(params)).then(r=>r.body)
test('initial relevance connects the strongest hub to counterparties before unrelated hubs',()=>{
 const names=['a','b','x','y','z','u','v'],rows=names.map(id=>({id}))
 const adjacency={a:['x','y','z'],b:['u','v'],x:['a'],y:['a'],z:['a'],u:['b'],v:['b']}
 const topology={adjacency,degree:Object.fromEntries(Object.entries(adjacency).map(([id,n])=>[id,n.length])),edgesByOrg:{},edges:[]}
 const ranked=graphRelevance({rows},topology,names.map((_,i)=>i),undefined,new Map(),3)
 assert.deepEqual(ranked.ids.slice(0,3).map(i=>rows[i].id),['a','x','y'])
})
test('global relevance ranks distinct counterparties, expands cumulatively and reports its basis',async()=>{
 const small=await graph({nodeLimit:'2'}),large=await graph({nodeLimit:'4'})
 assert.deepEqual(small.organizations.map(o=>o.id),['b','a'])
 assert.deepEqual(large.organizations.map(o=>o.id),['b','a','c','d'])
 assert.deepEqual(large.organizations.slice(0,2),small.organizations)
 assert.equal(small.ranking.basis,'connected-counterparties')
 assert.equal(small.organizations[0].relevance.connections,4)
 assert.equal(small.nextOffset,2)
})
test('selection reranks around its nearest and strongest counterparties, with stable expansion',async()=>{
 const small=await graph({org:'a',depth:'2',nodeLimit:'2'}),large=await graph({org:'a',depth:'2',nodeLimit:'4'}),changed=await graph({org:'c',depth:'2',nodeLimit:'4'})
 assert.deepEqual(small.organizations.map(o=>o.id),['a','c'])
 assert.deepEqual(large.organizations.map(o=>o.id),['a','c','b','d'])
 assert.deepEqual(changed.organizations.map(o=>o.id),['c','a','d','b'])
 assert.equal(large.organizations[1].relevance.selectedNodeTransactions,3)
 assert.equal(large.organizations[3].relevance.distance,2)
 assert.equal(large.ranking.selected,'a')
})
test('transaction pages cover pairs before repeated rows without dropping source identities',async()=>{
 const result=await graph({nodeLimit:'7'})
 assert.deepEqual(result.relationships.slice(0,6).map(r=>r.id),['row:0','row:1','row:4','row:5','row:6','row:7'])
 assert.deepEqual(new Set(result.relationships.map(r=>r.id)),new Set(records.map(r=>r.id)))
 for(const value of ['0','251','-1','no'])await assert.rejects(()=>graph({nodeLimit:value}),/Invalid nodeLimit/)
})

test('not-applicable classes never occupy top-X slots even when they are the strongest hub',()=>{
 const rows=[{id:'placeholder',nodeClass:'not-applicable'},{id:'real-a'},{id:'real-b'}];
 const topology={adjacency:{placeholder:['real-a','real-b'],'real-a':['placeholder','real-b'],'real-b':['placeholder','real-a']},degree:{placeholder:999,'real-a':2,'real-b':2},edgesByOrg:{},edges:[]};
 const result=graphRelevance({rows},topology,[0,1,2],undefined,new Map(),2);
 assert.deepEqual(result.ids,[1,2]);assert.equal(result.scores.has(0),false);
 const selected=graphRelevance({rows},topology,[0,1,2],'placeholder',new Map([['placeholder',0]]),2);
 assert.equal(selected.ids[0],0,'explicit inspection is still available');
 assert.deepEqual(graphRelevance({rows},topology,[0],undefined).ids,[]);
});

test('legacy indexed placeholders and placeholder community summaries are excluded before pagination',async()=>{
 const {isNotApplicableNode}=await import('../src/features/ecosystem/node-classes.js');
 assert.equal(isNotApplicableNode({id:'source-label:old',search:'not applicable source label'}),true);
 assert.equal(isNotApplicableNode({id:'real',name:'Not applicable'}),false);
 const clusters=[{id:'community-cluster:old',serverCommunity:'source-label:old',name:'Not applicable community · 9 organizations',count:9},{id:'community-cluster:valid',name:'Research community',count:3}];
 const result=await queryEcosystem(async path=>path.endsWith('topology.json')?{...topology,overview:{organizations:clusters,relationships:[]}}:read(path),'graph',new URLSearchParams({summary:'community'}));
 assert.deepEqual(result.body.organizations.map(o=>o.id),['community-cluster:valid']);
 assert.equal(result.body.total,1);assert.equal(result.body.nextOffset,null);
});

test('parent and child queries follow recorded direction, retain their anchor on later pages, and load the full neighborhood',async()=>{
 const {loadNeighborhoodPages}=await import('../src/features/ecosystem/network-neighborhood.js');
 const parents=await graph({org:'b',direction:'parents',nodeLimit:'2'});
 assert.deepEqual(new Set(parents.organizations.map(o=>o.id)),new Set(['b','a']));
 assert(parents.relationships.every(e=>e.target==='b'));
 const childPage=await graph({org:'b',direction:'children',nodeLimit:'2',offset:'2'});
 assert.deepEqual(new Set(childPage.organizations.map(o=>o.id)),new Set(['b','f','g']));
 assert(childPage.relationships.every(e=>e.source==='b'));
 const complete=await loadNeighborhoodPages(params=>graph(params),{org:'b',direction:'children',nodeLimit:'2'});
 assert.deepEqual(new Set(complete.organizations.map(o=>o.id)),new Set(['b','e','f','g']));
 assert.deepEqual(new Set(complete.relationships.map(e=>e.id)),new Set(['row:5','row:6','row:7']));
 assert.equal(complete.completeNeighborhood,true);assert.equal(complete.nextOffset,null);
 await assert.rejects(()=>graph({org:'b',direction:'invalid'}),/Invalid relationship direction/);
});

test('neighborhood loader follows transaction pages and rejects stuck pagination or changing snapshots',async()=>{
 const {loadNeighborhoodPages}=await import('../src/features/ecosystem/network-neighborhood.js');
 const base={version:'one',total:2,organizations:[{id:'a'},{id:'b'}],nextOffset:null};
 const complete=await loadNeighborhoodPages(async p=>({...base,relationships:[{id:'row:'+p.edgeOffset}],nextEdgeOffset:p.edgeOffset==='0'?1:null}),{org:'a'});
 assert.equal(complete.relationships.length,2);
 await assert.rejects(()=>loadNeighborhoodPages(async()=>({...base,relationships:[],nextEdgeOffset:0}),{org:'a'}),/did not advance/);
 let reads=0;await assert.rejects(()=>loadNeighborhoodPages(async()=>({...base,version:++reads===1?'one':'two',relationships:[],nextEdgeOffset:reads===1?1:null}),{org:'a'}),/snapshot changed/);
});
