import test from 'node:test'
import assert from 'node:assert/strict'
import {organizationEvidenceProfiles} from '../scripts/organization-evidence.mjs'
import {queryEcosystem,ecosystemResponse} from './ecosystem-query.mjs'
const organizations=['center','alias','payer','program'].map(id=>({id,name:id,portalSlug:id==='center'?'canonical':null}))
const relationships=[{id:'payment',source:'payer',target:'alias',sourceLabel:'Payer',targetLabel:'Original alias',kind:'transfer',amount:42},
 {id:'internal',source:'alias',target:'center',kind:'affiliation'},
 {id:'program',source:'center',target:'program',kind:'terms'}]
const evidence=organizationEvidenceProfiles({organizations,relationships})
const fixtures={'manifest.json':{version:'fixture',generatedAt:'2026-11-21',organizationEvidenceIndexVersion:1},
 'fixture/organization-evidence/index.json':evidence.aliases,'fixture/organization-evidence/0.json':evidence.entries,
 'fixture/organizations/index.json':{rows:organizations},'fixture/organizations/0.json':organizations,'fixture/relationships/0.json':relationships,
 'fixture/topology.json':{edges:[['payer','alias','transfer'],['alias','center','affiliation']],edgesByOrg:{payer:[0],alias:[0,1],center:[1]}}}
const read=async key=>{assert(key in fixtures,key);return structuredClone(fixtures[key])}
const query=(section,params={})=>queryEcosystem(read,section,new URLSearchParams({org:'canonical',members:JSON.stringify(['alias']),...params})).then(r=>r.body)
test('union deduplicates internal evidence before filtering and pagination; original endpoints survive',async()=>{
 const all=await query('organization-evidence',{limit:'2'}),next=await query('organization-evidence',{limit:'2',offset:'2'})
 assert.equal(all.total,3);assert.equal(all.organization.recordCount,3);assert.equal(next.records.length,1)
 assert.equal(new Set([...all.records,...next.records].map(r=>r.id)).size,3)
 const transfers=await query('organization-evidence',{kind:'transfer'});assert.equal(transfers.total,1)
 assert.equal(transfers.records[0].target,'alias');assert.equal(transfers.records[0].targetLabel,'Original alias');assert.equal(transfers.records[0].amount,42)
 const separate=await query('organization-evidence',{members:'[]'});assert.equal(separate.total,2)
})
test('group map has one center, exact one-hop neighbors, program links, and no internal/self edges',async()=>{
 const map=await query('organization-map');assert.equal(map.anchor,'center');assert.equal(map.total,2)
 assert.equal(map.incoming,1);assert.equal(map.outgoing,1)
 assert.deepEqual(map.organizations.map(n=>n.id).sort(),['center','payer','program'])
 assert(map.relationships.some(e=>e.source==='payer'&&e.target==='center'&&e.recordCount===1))
 assert(map.relationships.some(e=>e.target==='program'&&e.kinds.includes('terms')))
 assert(map.relationships.every(e=>e.source!==e.target))
 const first=await query('organization-map',{limit:'1'}),second=await query('organization-map',{limit:'1',offset:'1'})
 assert.equal(first.total,2);assert.equal(second.nextOffset,null)
 const separate=await query('organization-map',{members:'[]'});assert(separate.organizations.some(n=>n.id==='alias'));assert(!separate.organizations.some(n=>n.id==='payer'))
})
test('missing saved members are disclosed; invalid and oversized grouping inputs are rejected',async()=>{
 const group=await query('organization-group',{members:JSON.stringify(['alias','absent'])});assert.deepEqual(group.missingMembers,['absent'])
 for(const members of ['not json','{}',JSON.stringify(Array(51).fill('alias')),JSON.stringify([null]),JSON.stringify(['x'.repeat(301)])]){
  const response=await ecosystemResponse(new Request('https://example.test/api/ecosystem/organization-group?'+new URLSearchParams({org:'center',members})),read);assert.equal(response.status,400)
 }
})
test('map pagination shares a compact projection; readers, snapshots and group edits stay isolated',async()=>{
 const calls=[];let version='fixture'
 const reader=async key=>{calls.push(key);return key==='manifest.json'?{...fixtures[key],version}:read(key.replace(/^next\//,'fixture/'))}
 const request=(params={})=>queryEcosystem(reader,'organization-map',new URLSearchParams({org:'canonical',members:'["alias"]',limit:'1',...params})).then(r=>r.body)
 const [first,second]=await Promise.all([request(),request({offset:'1'})])
 assert.equal(first.total,2);assert.equal(second.total,2)
 assert.equal(calls.filter(key=>key.endsWith('/topology.json')).length,1,'concurrent pages must share the expensive index work')
 await request();assert.equal(calls.filter(key=>key.endsWith('/topology.json')).length,1)
 const separate=await request({members:'[]'});assert.equal(separate.incoming,1)
 assert.equal(calls.filter(key=>key.endsWith('/topology.json')).length,2,'membership changes need a separate projection')
 version='next';await request();assert.equal(calls.filter(key=>key.endsWith('/topology.json')).length,3,'new snapshots must rebuild')
 const otherReader=async key=>reader(key)
 await queryEcosystem(otherReader,'organization-map',new URLSearchParams({org:'canonical'}))
 assert.equal(calls.filter(key=>key.endsWith('/topology.json')).length,4,'different artifact stores must not share data')
})
test('failed neighborhood builds can retry without poisoning the cache',async()=>{
 let failing=true
 const reader=async key=>{if(failing&&key.endsWith('/topology.json'))throw Error('temporarily unavailable');return read(key)}
 const request=()=>queryEcosystem(reader,'organization-map',new URLSearchParams({org:'canonical'}))
 await assert.rejects(request(),/temporarily/);failing=false
 assert.equal((await request()).body.anchor,'center')
})
