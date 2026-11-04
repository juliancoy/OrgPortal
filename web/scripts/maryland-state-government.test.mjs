import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises'
import {projectMarylandGovernment,marylandId} from './maryland-state-government.mjs'
import {budgetAppropriations} from '../src/features/ecosystem/budget-appropriations.js'
import {createNetworkAnalysis} from '../src/features/ecosystem/network-analysis.js'
const agencies=JSON.parse(await readFile(new URL('./maryland-government-agencies.json',import.meta.url)))
const rows=agencies.map(a=>({fiscal_year:'2027',agency_code:a.code,agency_name:a.name,organization_code:a.code+'_A00_01',fund_type_name:'General Funds',fund_source_code:'GF01',fund_source_name:'General Funds',program_name:'Fixture program',budget:'100.0'}))
test('all listed agencies are children of one existing State of Maryland organization; funds are attributes',()=>{
 const p=projectMarylandGovernment(rows,[{id:marylandId,portalSlug:'state-of-maryland'}],agencies)
 assert.equal(p.organizations.length,81);assert.equal(p.organizations.find(o=>o.id===marylandId).portalSlug,'state-of-maryland');assert.equal(p.organizations.find(o=>o.id===marylandId).type,'State government organization')
 const edges=p.relationships.filter(r=>r.kind==='agency'),budget=p.relationships.filter(r=>r.kind==='appropriation')
 assert.equal(edges.length,80);assert.equal(budget.length,80);assert(edges.every(e=>e.source===marylandId&&e.amount===null));assert(budget.every(e=>e.source===marylandId&&e.fundType==='General Funds'))
 assert.equal(p.organizations.filter(o=>o.governmentClassification==='department').length,24);assert.equal(p.organizations.filter(o=>o.principalDepartment).length,22);assert.equal(p.organizations.filter(o=>o.entityType==='budget_heading').length,5)
 const analysis=createNetworkAnalysis(p.organizations,p.relationships);assert.equal(analysis.outgoing.has(marylandId),false)
 assert.equal(budgetAppropriations(p.organizations,p.relationships).get(marylandId)[0].amount,8000)
 assert.equal(new Set(p.organizations.find(o=>o.id===marylandId).governmentMembers.map(m=>m.id)).size,80)
 assert.equal(p.organizations.filter(o=>o.entityType==='budget_fund').length,0)
})
test('crosswalk coverage fails closed and preserves the established DHCD counterparty ID',()=>{
 assert.throws(()=>projectMarylandGovernment(rows.slice(1),[],agencies),/Incomplete/)
 assert.throws(()=>projectMarylandGovernment([...rows,{...rows[0],agency_code:'ZZZ'}],[],agencies),/Unreviewed/)
 assert.throws(()=>projectMarylandGovernment(rows,[],[...agencies,agencies[0]]),/Ambiguous/)
 assert.equal(agencies.find(a=>a.code==='S00').id,'source-label:maryland_comptroller:agency:4d8dd1e934535ab80e79f4f52ea96ad9')
})
