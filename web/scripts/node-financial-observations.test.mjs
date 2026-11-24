import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeNodeObservations,nodeAmountLabel} from '../src/features/ecosystem/node-financial-observations.js'
import {receivedUsdFromTotals,disbursedUsdFromTotals} from '../src/features/ecosystem/received-amount.js'
import {organizationEvidenceProfiles,consolidatedFinancialMetrics} from './organization-evidence.mjs'
const row=(id,kind,amount,extra={})=>({id,kind,financialFactType:kind,source:'public',target:'university',currency:'USD',fiscalYear:2025,amount,...extra})
test('absence is not a zero; actual net-zero cash and signed adjustments are preserved',()=>{
 assert.equal(receivedUsdFromTotals({currencies:[],missingAmounts:0}),null)
 assert.equal(disbursedUsdFromTotals({currencies:[{currency:'EUR',received:99,disbursed:0}],missingAmounts:0}),null)
 assert.equal(receivedUsdFromTotals({currencies:[{currency:'USD',received:0,disbursed:-5}],missingAmounts:0}),0)
 assert.equal(nodeAmountLabel({receivedUsd:null,disbursedUsd:null}),'Amount unavailable')
 assert.equal(nodeAmountLabel({receivedUsd:0,disbursedUsd:0}),'Cash ↓0 · ↑0')
})
test('annual categories, commitments, cash, currencies, snapshots and periods never combine',()=>{
 const records=[row('tuition','revenue',1e6),row('clinical','revenue',2e6),row('expense','expense',2.5e6,{source:'university',target:'staff'}),row('cash','disbursement',50,{kind:'transfer'}),row('older','revenue',4e6,{fiscalYear:2024}),row('euro','revenue',1e9,{currency:'EUR'}),row('void','revenue',1e9,{status:'voided'}),row('obligation','obligation',100),row('correction','obligation',-20,{periodStart:'2024-02-03',periodEnd:'2027-08-09'}),row('cumulative','obligation',1e10,{measurement:'cumulative_obligations'}),row('missing','appropriation',null)]
 records.push({...records[0]})
 const observations=summarizeNodeObservations(records,'university')
 assert.equal(observations.find(r=>r.fact==='revenue'&&r.fiscalYear===2025).received,3e6)
 assert.equal(observations.find(r=>r.fact==='revenue'&&r.fiscalYear===2024).received,4e6)
 assert.equal(observations.find(r=>r.fact==='expense').disbursed,2.5e6)
 assert.equal(observations.find(r=>r.fact==='obligation'&&!r.nonAdditive).received,80)
 assert.equal(observations.find(r=>r.nonAdditive).received,null)
 assert.equal(observations.find(r=>r.fact==='appropriation').received,null)
 assert.match(nodeAmountLabel({financialObservations:observations}),/^Rev ↓3M FY2025$/)
 assert.equal(summarizeNodeObservations(records,'public').find(r=>r.fact==='revenue'&&r.fiscalYear===2025).disbursed,3e6)
})
test('noncash labels are precomputed per node/year without consolidating related nonprofit filings',()=>{
 const organizations=[{id:'university',name:'University'},{id:'hospital',name:'Hospital',governmentParentId:'university'},{id:'public',name:'Public'},{id:'empty',name:'No records'}]
 const profiles=organizationEvidenceProfiles({organizations,relationships:[row('tuition','revenue',100),row('patient','revenue',200,{target:'hospital'}),row('old','revenue',50,{fiscalYear:2024})]})
 const get=id=>profiles.entries[profiles.aliases[id]]
 const metric=consolidatedFinancialMetrics(get('university'),'2025')
 assert.equal(metric.receivedUsd,null)
 assert.equal(metric.financialObservations.length,1)
 assert.equal(metric.financialObservations[0].received,100)
 assert.equal(consolidatedFinancialMetrics(get('hospital'),'2025').financialObservations[0].received,200)
 assert.equal(consolidatedFinancialMetrics(get('empty')).receivedUsd,null)
 assert.deepEqual(consolidatedFinancialMetrics(get('university'),'2023').financialObservations,[])
})
