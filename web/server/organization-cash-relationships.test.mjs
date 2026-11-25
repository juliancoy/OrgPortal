import test from 'node:test'
import assert from 'node:assert/strict'
import {organizationEvidenceProfiles} from '../scripts/organization-evidence.mjs'
import {queryEcosystem} from './ecosystem-query.mjs'

function fixture(legacy=false){
 const organizations=['recipient','alias','donor-a','donor-b','other','upstream'].map(id=>({id,name:id,networkMetrics:{receivedUsd:999999,disbursedUsd:999999}}))
 const cash=(id,source,target,amount,extra={})=>({id,source,target,amount,kind:'transfer',currency:'USD',fiscalYear:2025,...extra})
 const relationships=[
  ...Array.from({length:103},(_,i)=>cash('a'+i,'donor-a','recipient',10)),
  cash('refund','donor-a','recipient',-30),cash('b','donor-b','recipient',250),
  cash('old','donor-b','recipient',500,{fiscalYear:2024}),
  cash('unrelated','donor-a','other',500000),cash('second-hop','upstream','donor-a',500000),
  cash('reverse','recipient','donor-a',15),cash('alias-payment','donor-b','alias',25),
  cash('internal','recipient','alias',20),cash('missing','donor-b','recipient',null),
  cash('euro','donor-b','recipient',7,{currency:'EUR'}),
  cash('void','donor-a','recipient',1e9,{status:'voided'}),
  cash('award','donor-a','recipient',1e9,{financialFactType:'reported_award'}),
  cash('obligation','donor-a','recipient',1e9,{financialFactType:'obligation'}),
 ]
 relationships.push({...relationships[0],id:'mirror',transactionRecordId:'a0'})
 const profiles=organizationEvidenceProfiles({organizations,relationships}),calls=[]
 if(legacy)for(const profile of profiles.entries){delete profile.cashRelationships;delete profile.cashRelationshipsByYear}
 const edges=relationships.map(r=>[r.source,r.target,r.kind,null,r.fiscalYear]),edgesByOrg={}
 edges.forEach(([s,t],i)=>{for(const id of new Set([s,t]))(edgesByOrg[id]??=[]).push(i)})
 const read=async path=>{
  calls.push(path)
  if(path==='manifest.json')return {version:'fixture',organizationEvidenceIndexVersion:1,temporalIndexVersion:1,fiscalYears:[2024,2025]}
  if(path.endsWith('/organization-evidence/index.json'))return profiles.aliases
  if(path.endsWith('/organizations/index.json'))return {rows:organizations}
  if(path.endsWith('/topology.json'))return {edges,edgesByOrg}
  if(path.includes('/metrics/'))return organizations.map(n=>n.networkMetrics)
  const match=path.match(/\/(organizations|organization-evidence|relationships)\/(\d+)\.json$/)
  if(match){const rows=match[1]==='organizations'?organizations:match[1]==='relationships'?relationships:profiles.entries;return rows.slice(Number(match[2])*25,(Number(match[2])+1)*25)}
  throw Error(path)
 }
 return {calls,query:async(params={})=>(await queryEcosystem(read,'organization-map',new URLSearchParams({org:'recipient',fy:'2025',...params}))).body}
}

for(const legacy of [false,true])test(`relationship amounts reconcile, exclude unrelated spending and preserve directions (${legacy?'legacy':'indexed'})`,async()=>{
 const f=fixture(legacy),map=await f.query({parentDepth:'2'})
 const node=id=>map.organizations.find(n=>n.id===id)
 assert.deepEqual(node('donor-a').relationshipCash,{anchorId:'recipient',receivedUsd:15,disbursedUsd:1000,missingAmounts:0})
 assert.equal(node('donor-a').disbursedUsd,999999,'organization totals are retained separately')
 assert.equal(node('donor-b').relationshipCash.disbursedUsd,250)
 assert.equal(node('donor-b').relationshipCash.missingAmounts,1)
 assert.equal(node('upstream').relationshipCash.disbursedUsd,null,'second hop must not borrow organization-wide money')
 assert.equal(node('recipient').relationshipCash,undefined)
 const incoming=map.organizations.reduce((sum,n)=>sum+(n.relationshipCash?.disbursedUsd||0),0)
 const outgoing=map.organizations.reduce((sum,n)=>sum+(n.relationshipCash?.receivedUsd||0),0)
 assert.equal(incoming,node('recipient').receivedUsd)
 assert.equal(outgoing,node('recipient').disbursedUsd)
 assert.equal(incoming,1250)
 if(!legacy)assert(!f.calls.some(path=>/\/relationships\//.test(path)),'indexed map needs no transaction-detail reads')
 const reads=f.calls.filter(path=>/\/relationships\//.test(path)).length
 await f.query({parentDepth:'2',limit:'1',offset:'1'})
 assert.equal(f.calls.filter(path=>/\/relationships\//.test(path)).length,reads,'pagination reuses the full summary')
 assert.equal((await f.query({fy:'2024'})).organizations.find(n=>n.id==='donor-b').relationshipCash.disbursedUsd,500)
 assert.equal((await f.query({fy:'all'})).organizations.find(n=>n.id==='donor-b').relationshipCash.disbursedUsd,750)
 const payer=await f.query({org:'donor-a'})
 assert.equal(payer.organizations.find(n=>n.id==='recipient').relationshipCash.receivedUsd,1000)
})

test('grouped focus recomputes exact counterparties and excludes internal transfers',async()=>{
 const {query}=fixture(),map=await query({members:'["alias"]'})
 assert(!map.organizations.some(n=>n.id==='alias'))
 const donor=map.organizations.find(n=>n.id==='donor-b')
 assert.equal(donor.relationshipCash.disbursedUsd,275)
 assert.equal(map.organizations.find(n=>n.id==='recipient').receivedUsd,1275)
 assert.equal(map.organizations.find(n=>n.id==='recipient').disbursedUsd,15)
 assert.equal(map.organizations.reduce((sum,n)=>sum+(n.relationshipCash?.disbursedUsd||0),0),1275)
})
