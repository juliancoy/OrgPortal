import test from 'node:test'
import assert from 'node:assert/strict'
import {projectMarylandBudget} from './maryland-budget.mjs'
import {budgetAppropriations} from '../src/features/ecosystem/budget-appropriations.js'
import {graphRelationships,financialNodeAmounts} from '../src/features/ecosystem/portal-ecosystem.js'
import {createNetworkAnalysis} from '../src/features/ecosystem/network-analysis.js'
const options={fiscalYear:2027,agencyCode:'S00',targetId:'dhcd',targetName:'DHCD',budgetStatus:'legislative_appropriation'}
const row={fiscal_year:'2027',agency_code:'S00',agency_name:'Department of Housing and Community Development',organization_code:'S00_A20_01',fund_type_name:'General Funds',fund_source_code:'GF01',fund_source_name:'General Funds',program_name:'Office of the Secretary',budget:'100.0'}
test('appropriation rows survive the graph without entering payment totals; years and statuses remain distinct',()=>{
 const budget=projectMarylandBudget([row,{...row,fund_type_name:'Federal Funds',fund_source_code:'14.228',fund_source_name:'CDBG',budget:'200.0'}],options)
 const nodes=[...budget.organizations,{id:'dhcd'},{id:'payee'}],payment={id:'payment',kind:'transfer',source:'dhcd',target:'payee',currency:'USD',amount:90}
 const edges=[...budget.relationships,payment],data={organizations:nodes,relationships:edges}
 assert.equal(graphRelationships(data).length,3);assert.equal(graphRelationships(data,{moneyOnly:true}).length,1)
 assert.equal(financialNodeAmounts(data).get('dhcd'),90)
 const analysis=createNetworkAnalysis(nodes,edges);assert.equal(analysis.incoming.has('dhcd'),false);assert.equal(analysis.outgoing.get('dhcd'),90)
 const future={...budget.relationships[0],id:'next-year',fiscalYear:2028,amount:500},working={...budget.relationships[0],id:'working',budgetStatus:'working_budget',amount:600}
 const groups=budgetAppropriations(nodes,[...edges,budget.relationships[0],future,working]).get('dhcd')
 assert.equal(groups.length,3);assert.equal(groups.find(g=>g.fiscalYear===2027&&g.budgetStatus==='legislative_appropriation').amount,300)
 assert.equal(groups.find(g=>g.fiscalYear===2027&&g.budgetStatus==='legislative_appropriation').funds.length,2)
 assert.equal(budget.relationships[0].provenance.sourceRow.budget,'100.0');assert.match(budget.relationships[0].sourceUrl,/gy87-e27x/)
 assert.equal(projectMarylandBudget([row],options).relationships[0].id,budget.relationships[0].id)
})
test('collector rejects unknown status, wrong agency/year, duplicate source keys and malformed amounts',()=>{
 for(const changed of [{agency_code:'K00'},{fiscal_year:'2026'},{budget:'NaN'},{budget:'1.234'},{fund_source_code:''}])assert.throws(()=>projectMarylandBudget([{...row,...changed}],options))
 assert.throws(()=>projectMarylandBudget([row,row],options),/Duplicate/)
 assert.throws(()=>projectMarylandBudget([row],{...options,budgetStatus:'assumed_appropriation'}))
})
test('server funding and parent queries expose appropriation rows and full budget metadata',async()=>{
 const {queryEcosystem}=await import('../server/ecosystem-query.mjs')
 const budget=projectMarylandBudget([row],options),source=budget.organizations[0].id
 const nodes=[...budget.organizations,{id:'dhcd',name:'Department',networkMetrics:{budgetAppropriations:budgetAppropriations([{id:'dhcd'}],budget.relationships).get('dhcd')}}]
 const topology={edges:[[source,'dhcd','appropriation','2026-07-01']],edgesByOrg:{[source]:[0],dhcd:[0]},adjacency:{[source]:['dhcd'],dhcd:[source]},degree:{[source]:1,dhcd:1}}
 const manifest={version:'fixture',totals:{organizations:2,relationships:1},groups:{},marylandBudgetCoverage:{records:1}}
 const read=async path=>{
  if(path==='manifest.json')return manifest
  if(path.endsWith('organizations/index.json'))return {rows:nodes.map(n=>({...n,search:n.name.toLowerCase()})),filters:{}}
  if(path.endsWith('organizations/0.json'))return nodes
  if(path.endsWith('topology.json'))return topology
  if(path.endsWith('graph/0.json'))return budget.relationships
  throw Error('Unexpected fixture read '+path)
 }
 for(const params of [{mode:'funding',kind:'appropriation',org:'dhcd'},{org:'dhcd',direction:'parents'}]){
  const {body}=await queryEcosystem(read,'graph',new URLSearchParams(params))
  assert.equal(body.relationships.length,1);assert.equal(body.relationships[0].kind,'appropriation')
  assert.equal(body.marylandBudgetCoverage.records,1)
  assert.equal(body.organizations.find(n=>n.id==='dhcd').networkMetrics.budgetAppropriations[0].amount,100)
 }
})
