import test from 'node:test'
import assert from 'node:assert/strict'
import {collectAwards,normalizeAwards} from './lib/government-awards.mjs'
import {mergeNetworkHistory} from '../src/features/ecosystem/network-history.js'
const row={generated_internal_id:'ASST_123', 'Award ID':'123','Recipient Name':'Example University','Recipient UEI':'ABC123','Awarding Agency':'National Science Foundation','Awarding Agency Code':'049','Award Amount':100,'Start Date':'2025-01-01'}
test('paginates fully and rejects incomplete, repeated and malformed feeds',async()=>{
 const fetcher=async(_url,options)=>({ok:true,json:async()=>({results:[{...row,generated_internal_id:`ASST_${JSON.parse(options.body).page}`}],page_metadata:{hasNext:JSON.parse(options.body).page===1}})})
 assert.equal((await collectAwards(fetcher,'2024-10-01','2025-09-30')).results.length,2)
 await assert.rejects(collectAwards(fetcher,'2024-10-01','2025-09-30',1),/Incomplete import/)
 await assert.rejects(collectAwards(async()=>({ok:true,json:async()=>({results:[row],page_metadata:{hasNext:true}})}),'2024-10-01','2025-09-30'),/repeated/)
 await assert.rejects(collectAwards(async()=>({ok:true,json:async()=>({results:[]})}),'2024-10-01','2025-09-30'),/Invalid/)
})
test('retains government IDs and financial meaning without inferring payment',()=>{
 const d=normalizeAwards({results:[row]},'2026-10-14T00:00:00Z',{start:'2024-10-01',end:'2025-09-30'})
 assert.equal(d.relationships[0].financialMeasure,'cumulative_obligations')
 assert.equal(d.relationships[0].status,'reported')
 assert.match(d.relationships[0].notes,/not cash paid/)
 const base={organizations:[{id:'existing',name:row['Recipient Name']}],relationships:[],financing:[]}
 const once=mergeNetworkHistory(base,d),twice=mergeNetworkHistory(once,d)
 assert.equal(twice.relationships.length,1)
 assert.equal(twice.financing.length,0)
 assert.notEqual(twice.relationships[0].target,'existing','Name alone cannot merge legal recipients')
 const identified=mergeNetworkHistory({...base,organizations:[{id:'existing',name:'Different spelling',identifiers:{uei:'ABC123'}}]},d)
 assert.equal(identified.relationships[0].target,'existing')
 assert.throws(()=>normalizeAwards({results:[{...row,'Award Amount':null}]},'',{}),/Incomplete award/)
})

test('refresh replaces obligations and removes awards outside the new coverage',()=>{
 const period={start:'2024-10-01',end:'2025-09-30'}
 const initial=normalizeAwards({results:[row]},'2026-10-14',period)
 const base=mergeNetworkHistory({organizations:[],relationships:[],financing:[]},{...initial,governmentCoverage:initial.coverage})
 const revised=normalizeAwards({results:[{...row,'Award Amount':75}]},'2026-10-15',period)
 const refreshed=mergeNetworkHistory(base,{...revised,governmentCoverage:revised.coverage})
 assert.equal(refreshed.relationships.length,1);assert.equal(refreshed.relationships[0].amount,75)
 const empty=normalizeAwards({results:[]},'2026-10-16',period)
 assert.equal(mergeNetworkHistory(refreshed,{...empty,governmentCoverage:empty.coverage}).relationships.length,0)
})
test('redacted recipients retain every award and their sum',()=>{
 const result=normalizeAwards({results:[{...row,'Recipient Name':'REDACTED DUE TO PII'}]},'',{})
 assert.equal(result.relationships.length,1);assert.equal(result.coverage.unidentifiedAwardCount,1);assert.equal(result.coverage.unidentifiedObligationsUsd,100);assert.equal(result.relationships[0].targetLabel,'Redacted');assert.equal(result.relationships[0].recipientIdentity,'unidentified')
})
test('award identity prevents duplicate funding totals across different source URLs',async()=>{
 const {financialNodeTotals}=await import('../src/features/ecosystem/fund-pies.js')
 const d=normalizeAwards({results:[row]},'2026-10-14',{})
 d.relationships.push({...d.relationships[0],id:'nih-reference',sourceUrl:'https://reporter.nih.gov/'})
 assert.equal(financialNodeTotals(d).get(d.relationships[0].target).received,100)
 const {organizationPreview,networkPreviewSummaries}=await import('../src/features/ecosystem/ecosystem-view.js')
 assert.doesNotMatch(organizationPreview(d.organizations[1],networkPreviewSummaries(d)),/href="\/orgs\//)
})

test('reconciles capped searches by amount without dropping boundary awards',async()=>{
 const {collectGovernmentAwards}=await import('./lib/government-awards.mjs')
 const seed={requests:[],results:Array.from({length:10000},(_,i)=>({...row,generated_internal_id:`award-${i}`,'Award Amount':i===9999?1:100}))}
 const fetcher=async(url,options)=>({ok:true,json:async()=>url.includes('spending_by_award_count')?{results:{grants:10001}}:{results:[seed.results.at(-1),{...row,generated_internal_id:'missing-award','Award Amount':0}],page_metadata:{hasNext:false}}})
 assert.equal((await collectGovernmentAwards(fetcher,'2024-10-01','2025-09-30',()=>{},seed)).results.length,10001)
 await assert.rejects(collectGovernmentAwards(async()=>({ok:true,json:async()=>({results:{grants:2}})}),'2024-10-01','2025-09-30',()=>{},{requests:[],results:[row]}),/expected 2 unique grants/)
})
