import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeOrganizationTransfers,organizationFinancialTotals} from './organization-financial-totals.mjs'
import {organizationEvidenceProfiles} from '../scripts/organization-evidence.mjs'
import {queryEcosystem} from './ecosystem-query.mjs'
const transfer=(id,amount,extra={})=>({id,source:'payer',target:'recipient',kind:'transfer',currency:'USD',amount,...extra})
test('signed transfers, distinct currencies, deduplication and exclusions',()=>{
 const rows=[transfer('a',100),transfer('a',100),transfer('refund',-20),transfer('out',30,{source:'recipient',target:'payer'}),transfer('eur',8,{currency:'EUR'}),transfer('missing',null),transfer('no-currency',40,{currency:null}),transfer('void',99,{status:'voided'}),transfer('approval',99,{kind:'approval'}),transfer('budget',99,{kind:'appropriation'}),transfer('obligation',99,{financialMeasure:'cumulative_obligations'}),transfer('self',99,{source:'recipient'})]
 assert.deepEqual(summarizeOrganizationTransfers(rows,['recipient']),{currencies:[{currency:'EUR',received:8,disbursed:0},{currency:'USD',received:80,disbursed:30}],missingAmounts:2})
 assert.deepEqual(summarizeOrganizationTransfers(rows,['recipient','payer']),{currencies:[],missingAmounts:0})
})
test('complete totals survive pagination and evidence filters; grouped internal transfers are excluded',async()=>{
 const organizations=['payer','recipient','alias'].map(id=>({id,name:id})),relationships=Array.from({length:103},(_,i)=>transfer(String(i),10))
 relationships.push(transfer('internal',50,{source:'recipient',target:'alias'}),transfer('approval',999,{kind:'approval'}))
 const profiles=organizationEvidenceProfiles({organizations,relationships})
 const read=async path=>{
  if(path==='manifest.json')return {version:'fixture',generatedAt:'2026-11-22',organizationEvidenceIndexVersion:1}
  if(path.endsWith('/index.json'))return profiles.aliases
  const page=Number(path.split('/').pop().replace('.json',''))
  return (path.includes('/relationships/')?relationships:profiles.entries).slice(page*25,page*25+25)
 }
 const query=params=>queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'recipient',limit:'1',...params})).then(r=>r.body)
 const first=await query({}),filtered=await query({kind:'approval'})
 assert.deepEqual(first.financialTotals,{currencies:[{currency:'USD',received:1030,disbursed:50}],missingAmounts:0})
 assert.deepEqual(filtered.financialTotals,first.financialTotals)
 const grouped=await query({members:'["alias"]'})
 assert.deepEqual(grouped.financialTotals,{currencies:[{currency:'USD',received:1030,disbursed:0}],missingAmounts:0})
 // Older artifacts use the same calculation and cannot truncate at a record page.
 for(const profile of profiles.entries)delete profile.financialTotals
 assert.deepEqual((await query({offset:'25'})).financialTotals,first.financialTotals)
})
test('legacy summary cache is scoped by reader, snapshot and membership, and failures can retry',async()=>{
 let calls=0,fail=true
 const read=async()=>{},readRows=async()=>{calls++;if(fail)throw Error('unavailable');return [transfer('a',10)]}
 const profile={organization:{id:'recipient'},recordKinds:{transfer:[0]}}
 const request=(version='one',p=profile)=>organizationFinancialTotals(read,readRows,{version},p)
 await assert.rejects(request(),/unavailable/);fail=false
 await Promise.all([request(),request()]);assert.equal(calls,2)
 await request();assert.equal(calls,2)
 await request('two');assert.equal(calls,3)
 await request('two',{...profile,members:[{id:'recipient'},{id:'payer'}]});assert.equal(calls,4)
 await organizationFinancialTotals(async()=>{},readRows,{version:'two'},profile);assert.equal(calls,5)
})

test('LaunchPort awards stay separate from payments through grouping, fiscal filters and legacy pagination',async()=>{
 const {transactionTime}=await import('../src/features/ecosystem/transaction-time.js')
 const organizations=['payer','recipient','alias'].map(id=>({id,name:id}))
 const relationships=[
  transfer('workforce',41500,{date:'FY2025',description:'Workforce grant',status:'reported'}),
  transfer('infrastructure',234100,{date:'FY2025',description:'Infrastructure grant',status:'reported'}),
  transfer('build',700000,{date:'2025-06-10',sourceUrl:'https://governor.maryland.gov/award',description:'Build Our Future infrastructure grant',notes:'award reported, payment unverified.'}),
  transfer('payment',350000,{target:'alias',date:'2025-05-13',sourceUrl:'https://interactive2.marylandtaxes.gov/MDVIEW',description:'Grant payment',financialFactType:'disbursement'}),
 ].map(row=>({...row,...transactionTime(row)}))
 assert(relationships.every(row=>row.fiscalYear===2025))
 const profiles=organizationEvidenceProfiles({organizations,relationships})
 // Exercise the grouped request path, not just the single-organization cache.
 const read=async path=>{
  if(path==='manifest.json')return {version:'fixture',organizationEvidenceIndexVersion:1,temporalIndexVersion:1}
  if(path.endsWith('/index.json'))return profiles.aliases
  const page=Number(path.split('/').pop().replace('.json',''))
  return (path.includes('/relationships/')?relationships:profiles.entries).slice(page*25,page*25+25)
 }
 const query=params=>queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'recipient',members:'["alias"]',fy:'2025',limit:'1',...params})).then(r=>r.body)
 const report=await query({})
 assert.equal(report.total,4)
 assert.deepEqual(report.financialTotals,{currencies:[{currency:'USD',received:350000,disbursed:0}],missingAmounts:0,awards:[{currency:'USD',received:975600,disbursed:0}],missingAwardAmounts:0})
 assert.deepEqual((await query({offset:'1'})).financialTotals,report.financialTotals)
 assert.equal((await query({fy:'unassigned'})).total,0)
 assert.equal(summarizeOrganizationTransfers([transfer('paid-grant',12,{description:'Grant',status:'delivered'})],['recipient']).currencies[0].received,12)
 assert.deepEqual(summarizeOrganizationTransfers([transfer('award',99,{financialFactType:'reported_award',status:'delivered'})],['recipient']).currencies,[])
})
