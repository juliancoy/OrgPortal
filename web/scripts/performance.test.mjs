import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildPerformance} from './build-performance.mjs'
const government={coverage:{},relationships:[{awardKey:'a',target:'org',recipientIdentity:'identified',amount:100},{awardKey:'b',recipientIdentity:'unidentified',amount:-10}]}
const a={awardKey:'a',cohort:'pilot-2025',metric:'Jobs retained',unit:'jobs',direction:'higher',target:10,actual:8,commitment:'Retain ten jobs',result:'Eight verified',reviewerOrganization:'Fixture reviewer',methodology:'Count verified twelve month positions',commitmentUrl:'https://example.test/promise',resultUrl:'https://example.test/result',reviewUrl:'https://example.test/review',dueDate:'2025-01-01',measuredDate:'2025-02-01',reviewedDate:'2025-03-01',evidenceBasis:'certified'}
test('preserves signed unidentified exposure without manufacturing assessments',()=>{const d=buildPerformance(government,{assessments:[]});assert.equal(d.records.length,2);assert.equal(d.records[1].amount,-10);assert.equal(d.assessments.length,0)})
test('requires identified, sourced, mature and unique award reviews',()=>{const d=buildPerformance(government,{assessments:[a]});assert.equal(d.assessments[0].attainment,.8);for(const patch of [{awardKey:'b'},{resultUrl:'javascript:alert(1)'},{target:0},{measuredDate:'2024-01-01'},{reviewerOrganization:''}])assert.throws(()=>buildPerformance(government,{assessments:[{...a,...patch}]}));assert.throws(()=>buildPerformance(government,{assessments:[a,a]}))})
test('lower targets and cohort compatibility are explicit',()=>{assert.equal(buildPerformance(government,{assessments:[{...a,direction:'lower',actual:5}]}).assessments[0].attainment,2);assert.throws(()=>buildPerformance({...government,relationships:[...government.relationships,{...government.relationships[0],awardKey:'c'}]},{assessments:[a,{...a,awardKey:'c',unit:'people'}]}))})

test('zero lower-is-better results have no invented ratio; overflowing ratios are rejected',()=>{const r=buildPerformance(government,{assessments:[{...a,direction:'lower',actual:0}]}).assessments[0];assert.equal(r.attainment,null);assert.equal(r.meetsTarget,true);assert.throws(()=>buildPerformance(government,{assessments:[{...a,target:Number.MIN_VALUE,actual:Number.MAX_VALUE}]}))})

test('historical pilot source checksum and explicit outcomes reconcile with published input',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto')
 const input=JSON.parse(await readFile(new URL('../data/performance-assessments.json',import.meta.url),'utf8'))
 const review=JSON.parse(await readFile(new URL('../public/ecosystem-data/sources/maryland-medaaf-review.json',import.meta.url),'utf8'))
 const pdf=await readFile(new URL('../public/ecosystem-data/sources/maryland-medaaf-fy2019.pdf',import.meta.url))
 assert.equal(createHash('sha256').update(pdf).digest('hex'),review.sourceSha256)
 assert.deepEqual(input.assessments.map(a=>[a.target,a.actual,a.measuredDate]),[[128,100,'2018-12-31'],[770,786,'2018-12-31'],[56,39,'2018-12-31']])
 assert.deepEqual(review.assessments,input.assessments)
 const d=buildPerformance(government,input);assert.equal(d.records.filter(r=>r.financialMeasure==='original conditional loan principal').length,3)
 assert(d.assessments.find(a=>a.awardKey.includes('amick')).meetsTarget)
 assert.equal(d.assessments.filter(a=>!a.meetsTarget).length,2)
})
