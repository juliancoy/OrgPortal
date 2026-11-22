import test from 'node:test'
import assert from 'node:assert/strict'
import {queryEcosystem} from './ecosystem-query.mjs'
import {organizationEvidenceProfiles} from '../scripts/organization-evidence.mjs'
function fixture(legacy=false){
 const organizations=['center','old','new','undated','alias'].map(id=>({id,name:id,networkMetrics:{amount:999999}}))
 const relationships=[
  {id:'old',source:'old',target:'center',kind:'transfer',fiscalYear:2024,amount:900,currency:'USD'},
  ...Array.from({length:28},(_,i)=>({id:'new'+i,source:'new',target:'center',kind:'transfer',fiscalYear:2025,amount:10,currency:'USD'})),
  {id:'refund',source:'new',target:'center',kind:'transfer',fiscalYear:2025,amount:-5,currency:'USD'},
  {id:'approval',source:'new',target:'center',kind:'approval',fiscalYear:2025,amount:9999,currency:'USD'},
  {id:'unknown',source:'undated',target:'center',kind:'transfer',amount:50,currency:'USD'},
  {id:'member',source:'new',target:'alias',kind:'transfer',fiscalYear:2025,amount:20,currency:'USD'},
  {id:'internal',source:'center',target:'alias',kind:'transfer',fiscalYear:2025,amount:30,currency:'USD'},
  {id:'program',source:'center',target:'undated',kind:'terms',fiscalYear:2024}]
 const profiles=organizationEvidenceProfiles({organizations,relationships})
 if(legacy)for(const profile of profiles.entries)delete profile.recordFiscalYears
 const edges=relationships.filter(row=>row.kind!=='terms').map(row=>[row.source,row.target,row.kind,'',row.fiscalYear||null]),edgesByOrg={}
 edges.forEach(([a,b],i)=>{for(const id of new Set([a,b]))(edgesByOrg[id]??=[]).push(i)})
 const read=async path=>{
  if(path==='manifest.json')return {version:'fixture',generatedAt:'2026-11-22',temporalIndexVersion:1,organizationEvidenceIndexVersion:1,fiscalYears:[2024,2025]}
  if(path.endsWith('/organization-evidence/index.json'))return profiles.aliases
  if(path.endsWith('/organizations/index.json'))return {rows:organizations}
  if(path.endsWith('/topology.json'))return {edges,edgesByOrg}
  const match=path.match(/fiscal\/(2024|2025|unassigned)\/metrics\/0.json/)
  if(match)return organizations.map((org,i)=>({amount:match[1]==='2025'?100+i:match[1]==='2024'?200+i:300+i}))
  const page=Number(path.split('/').pop().replace('.json',''))
  if(path.includes('/organization-evidence/'))return profiles.entries.slice(page*25,page*25+25)
  if(path.includes('/relationships/'))return relationships.slice(page*25,page*25+25)
  if(path.includes('/organizations/'))return organizations.slice(page*25,page*25+25)
  throw Error(path)
 }
 const query=(section,params={})=>queryEcosystem(read,section,new URLSearchParams({org:'center',...params})).then(r=>r.body)
 return {query,read,organizations}
}
test('hidden-year parent navigation uses only incoming all-year candidates and leaves displayed years isolated',async()=>{
 const {query,organizations}=fixture()
 organizations.find(n=>n.id==='old').networkMetrics.amount=2000
 organizations.find(n=>n.id==='new').networkMetrics.amount=1000
 organizations.find(n=>n.id==='undated').networkMetrics.amount=NaN
 organizations.find(n=>n.id==='alias').networkMetrics.amount=1e12 // outgoing, never a parent
 const empty=await query('organization-map',{fy:'2026'})
 assert.equal(empty.total,0);assert.equal(empty.incoming,0);assert.equal(empty.relationships.length,0)
 assert.deepEqual(empty.organizations.map(n=>n.id),['center'])
 assert.equal(empty.hiddenParent.id,'old');assert.equal(empty.hiddenParent.financialAmount,2000);assert.equal(empty.fy,'2026')
 const current=await query('organization-map',{fy:'2025'})
 assert.equal(current.hiddenParent,null,'visible year-scoped parents take precedence')
 const grouped=await query('organization-map',{fy:'2026',members:'["old"]'})
 assert.equal(grouped.hiddenParent.id,'new','group members cannot be their own upstream parent')
 const root=await query('organization-map',{org:'new',fy:'2026'})
 assert.equal(root.hiddenParent,null,'a node with only outgoing links has no fallback parent')
 assert.equal((await query('organization-map',{fy:'all'})).hiddenParent,null)
})
for(const legacy of [false,true])test(`year-scoped evidence totals, pagination and grouped records (${legacy?'legacy':'indexed'})`,async()=>{
 const {query}=fixture(legacy)
 const current=await query('organization-evidence',{fy:'2025',limit:'25'})
 assert.equal(current.total,31);assert.equal(current.organization.recordCount,31);assert.equal(current.nextOffset,25)
 assert(current.records.every(r=>r.fiscalYear===2025))
 assert.deepEqual(current.financialTotals.currencies,[{currency:'USD',received:275,disbursed:30}])
 const next=await query('organization-evidence',{fy:'2025',offset:'25'});assert.equal(next.records.length,6);assert.deepEqual(next.financialTotals,current.financialTotals)
 const approvals=await query('organization-evidence',{fy:'2025',kind:'approval'});assert.equal(approvals.total,1);assert.deepEqual(approvals.financialTotals,current.financialTotals)
 assert.equal((await query('organization-evidence',{fy:'2024'})).financialTotals.currencies[0].received,900)
 assert.equal((await query('organization-evidence',{fy:'unassigned'})).total,1)
 assert.equal((await query('organization-evidence',{fy:'all'})).financialTotals.currencies[0].received,1225)
 assert.equal((await query('organization-evidence',{fy:'2026'})).total,0)
 const grouped=await query('organization-evidence',{fy:'2025',members:'["alias"]'})
 assert.equal(grouped.total,32);assert.deepEqual(grouped.financialTotals.currencies,[{currency:'USD',received:295,disbursed:0}])
 assert(!('recordFiscalYears' in current));assert.deepEqual((await query('organization-evidence',{fy:'2025'})).financialTotals,current.financialTotals)
})
test('map years independently filter edges, program terms, node volumes and pagination, retaining an empty anchor',async()=>{
 const {query}=fixture()
 for(const [fy,expected,amount] of [['2025',['alias','center','new'],100],['2024',['center','old','undated'],200],['unassigned',['center','undated'],300]]){
  const map=await query('organization-map',{fy})
  assert.deepEqual(map.organizations.map(n=>n.id).sort(),expected)
  assert.equal(map.organizations.find(n=>n.id==='center').financialAmount,amount)
  const first=await query('organization-map',{fy,limit:'1'});assert.equal(first.organizations.length,2)
 }
 const all=await query('organization-map',{fy:'all'});assert.equal(all.organizations.length,5);assert.equal(all.organizations[0].financialAmount,999999)
 const empty=await query('organization-map',{fy:'2026'});assert.equal(empty.anchor,'center');assert.equal(empty.total,0);assert.equal(empty.relationships.length,0)
 assert.equal((await query('organization-map',{fy:'2025'})).organizations.find(n=>n.id==='center').financialAmount,100)
 await assert.rejects(query('organization-map',{fy:'invalid'}),/Invalid fiscal year/)
})

for(const legacy of [false,true])test(`map bubbles match complete evidence totals across fiscal years and groups (${legacy?'legacy':'indexed'})`,async()=>{
 const {query}=fixture(legacy)
 for(const fy of ['all','2024','2025','unassigned','2026'])for(const members of [undefined,'["alias"]']){
  const params={fy,...(members?{members}:{})}
  const evidence=await query('organization-evidence',params)
  const map=await query('organization-map',{...params,limit:'1'})
  assert.deepEqual(map.financialTotals,evidence.financialTotals)
  if(map.nextOffset!==null)assert.deepEqual((await query('organization-map',{...params,offset:String(map.nextOffset),limit:'1'})).financialTotals,evidence.financialTotals)
 }
})
