import test from 'node:test'
import assert from 'node:assert/strict'
import {organizationEvidenceProfiles,consolidatedFinancialMetrics} from '../scripts/organization-evidence.mjs'
import {queryEcosystem} from './ecosystem-query.mjs'

function fixture(){
 const organizations=[{id:'state',name:'State',portalSlug:'state'},
  {id:'department',name:'Department',governmentParentId:'state',governmentClassification:'department'},
  {id:'office',name:'Office',governmentParentId:'department'},
  {id:'agency',name:'Agency',governmentParentId:'state',governmentMembers:[{id:'office'}]},
  {id:'payer',name:'Payer'},{id:'vendor',name:'Vendor'},{id:'alias',name:'Alias'}]
 const payment=(id,source,target,amount,extra={})=>({id,source,target,amount,currency:'USD',kind:'transfer',fiscalYear:2025,...extra})
 const relationships=[payment('funding','payer','department',200),payment('payment','office','vendor',100),
  payment('refund','office','vendor',-5),payment('internal','state','department',90),payment('sibling','agency','office',10),
  payment('old','department','vendor',500,{fiscalYear:2024}),payment('undated','state','vendor',7,{fiscalYear:null}),
  payment('eur','agency','vendor',50,{currency:'EUR'}),payment('void','department','vendor',1000,{status:'voided'}),
  payment('approval','department','vendor',1000,{kind:'approval'}),payment('budget','state','department',1000,{kind:'appropriation'}),
  payment('obligation','department','vendor',1000,{financialFactType:'obligation'}),
  payment('missing','department','vendor',null),payment('alias','office','alias',20)]
 relationships.push({...relationships[1]})
 const profiles=organizationEvidenceProfiles({organizations,relationships})
 const byId=new Map(profiles.entries.map(p=>[p.organization.id,p]))
 for(const org of organizations)org.networkMetrics=consolidatedFinancialMetrics(byId.get(org.id))||{amount:100}
 const edges=relationships.map(r=>[r.source,r.target,r.kind,'',r.fiscalYear]),edgesByOrg={}
 edges.forEach(([a,b],index)=>{for(const id of new Set([a,b]))(edgesByOrg[id]??=[]).push(index)})
 const read=async path=>{
  if(path==='manifest.json')return {version:'fixture',generatedAt:'2026-11-22',organizationEvidenceIndexVersion:1,temporalIndexVersion:1,fiscalYears:[2024,2025]}
  if(path.endsWith('/organization-evidence/index.json'))return profiles.aliases
  if(path.endsWith('/organization-evidence/0.json'))return profiles.entries
  if(path.endsWith('/organizations/index.json'))return {rows:organizations}
  if(path.endsWith('/organizations/0.json'))return organizations
  if(path.endsWith('/relationships/0.json'))return relationships
  if(path.endsWith('/topology.json'))return {edges,edgesByOrg}
  const year=path.match(/fiscal\/(\w+)\/metrics\/0.json/)
  if(year)return organizations.map(org=>consolidatedFinancialMetrics(byId.get(org.id),year[1])||{amount:100})
  throw Error(path)
 }
 const query=(section,params={})=>queryEcosystem(read,section,new URLSearchParams({org:'state',fy:'2025',...params})).then(r=>r.body)
 return {query,profiles,organizations,relationships}
}
test('consolidation deduplicates shared descendants and mirrored records, excludes internal transfers, and preserves original endpoints',async()=>{
 const {query}=fixture(),evidence=await query('organization-evidence',{limit:'100'})
 assert.deepEqual(evidence.financialMembers,['agency','department','office','state'])
 assert.deepEqual((await query('organization-map')).financialTotals,evidence.financialTotals)
 assert.deepEqual(evidence.financialTotals,{currencies:[{currency:'EUR',received:0,disbursed:50},{currency:'USD',received:200,disbursed:115}],missingAmounts:1})
 assert.equal(evidence.records.filter(r=>r.id==='payment').length,1)
 assert.equal(evidence.records.find(r=>r.id==='payment').source,'office')
 assert(evidence.records.some(r=>r.id==='internal'),'internal evidence remains inspectable although excluded from consolidated totals')
 const page=await query('organization-evidence',{limit:'1',offset:'1',kind:'approval'})
 assert.deepEqual(page.financialTotals,evidence.financialTotals)
 assert.equal((await query('organization-evidence',{fy:'2024'})).financialTotals.currencies[0].disbursed,500)
 assert.equal((await query('organization-evidence',{fy:'unassigned'})).financialTotals.currencies[0].disbursed,7)
 assert.equal((await query('organization-evidence',{fy:'all'})).financialTotals.currencies.find(c=>c.currency==='USD').disbursed,622)
 assert.deepEqual((await query('organization-evidence',{fy:'2027'})).financialTotals,{currencies:[],missingAmounts:0})
 const grouped=await query('organization-evidence',{members:'["department","alias"]'})
 assert.deepEqual(grouped.financialTotals.currencies.find(c=>c.currency==='USD'),{currency:'USD',received:200,disbursed:95})
 assert(!grouped.financialMembers.includes('vendor'))
})
test('year-filtered maps show departments downstream and parent upstream, separately from payments, with consistent parent volume',async()=>{
 const {query}=fixture(),map=await query('organization-map')
 assert.equal(map.organizations.find(n=>n.id==='state').financialAmount,315)
 const hierarchy=map.relationships.filter(e=>e.hierarchy)
 assert.deepEqual(hierarchy.map(e=>e.target).sort(),['agency','department'])
 assert(hierarchy.every(e=>e.source==='state'&&e.recordCount===0&&e.kinds[0]==='agency'))
 assert(map.relationships.some(e=>e.source==='state'&&e.target==='department'&&!e.hierarchy),'actual records remain separate')
 assert(!map.organizations.some(n=>n.id==='office'),'grandchildren are not direct map neighbors')
 const department=await query('organization-map',{org:'department'})
 assert.equal(department.organizations.find(n=>n.id==='state').financialAmount,315)
 assert(department.relationships.some(e=>e.hierarchy&&e.source==='state'&&e.target==='department'))
 for(const fy of ['2024','unassigned','2027']){
  const annual=await query('organization-map',{fy})
  assert.equal(annual.relationships.filter(e=>e.hierarchy).length,2)
 }
 const first=await query('organization-map',{limit:'1'}),next=await query('organization-map',{limit:'1',offset:String(first.nextOffset)})
 assert.equal(first.organizations.length,2);assert.equal(next.organizations.length,2)
 assert.equal((await query('organization-map',{fy:'all'})).organizations.find(n=>n.id==='state').financialAmount,822)
})
test('cycles terminate without counting the same organizational member twice',()=>{
 const {organizations,relationships}=fixture()
 organizations.find(n=>n.id==='office').governmentMembers=[{id:'state'}]
 const profiles=organizationEvidenceProfiles({organizations,relationships}),state=profiles.entries[profiles.aliases.state]
 assert.deepEqual(state.financialMembers,['agency','department','office','state'])
 assert.equal(state.financialTotals.currencies.find(c=>c.currency==='USD').disbursed,622)
})
