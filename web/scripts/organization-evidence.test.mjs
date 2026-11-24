import {transactionAmountRanks} from '../src/features/ecosystem/transaction-amount-order.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {organizationEvidenceProfiles,consolidatedFinancialMetrics} from './organization-evidence.mjs'
import {attachSourceAgencies} from './source-agency-references.mjs'
import {marylandAgencyReferences} from './maryland-agency-references.mjs'
import {projectNativeEvidence} from './unified-ecosystem.mjs'
import {queryEcosystem} from '../server/ecosystem-query.mjs'
const fixture=()=>({organizations:[{id:'state',name:'Example state',portalSlug:'example-state'},{id:'department',name:'Department',governmentParentId:'state',governmentClassification:'department',governmentSourceUrl:'https://example.gov/agencies'},{id:'recipient',name:'Recipient'},{id:'heading',name:'Budget heading',governmentParentId:'state',governmentClassification:'budget_heading',entityType:'budget_heading'}],relationships:[{id:'appropriation',source:'state',target:'department',kind:'appropriation',amount:100},{id:'payment',source:'department',target:'recipient',kind:'transfer',amount:20,sourceSystem:'source',sourceDataset:'payments'},{id:'approval',source:'department',target:'recipient',kind:'approval',amount:-10},{id:'grant',source:'state',target:'recipient',kind:'grant',amount:30}],financing:[]})
test('every node indexes received USD from signed cash evidence, separately from volume and awards',()=>{
 const data=fixture()
 data.relationships=data.relationships.map(row=>({...row,currency:'USD',fiscalYear:2025}))
 data.relationships.push(
  {id:'adjustment',source:'department',target:'recipient',kind:'transfer',amount:-5,currency:'USD',fiscalYear:2025},
  {id:'award',source:'department',target:'recipient',kind:'transfer',amount:1e9,currency:'USD',financialFactType:'reported_award',fiscalYear:2025},
  {id:'euro',source:'department',target:'recipient',kind:'transfer',amount:1e6,currency:'EUR',fiscalYear:2025},
  {id:'internal',source:'state',target:'department',kind:'transfer',amount:900,currency:'USD',fiscalYear:2025})
 const profiles=organizationEvidenceProfiles(data),get=id=>profiles.entries[profiles.aliases[id]]
 assert.equal(consolidatedFinancialMetrics(get('recipient')).receivedUsd,15)
 assert.equal(consolidatedFinancialMetrics(get('recipient'),'2025').receivedUsd,15)
 assert.equal(consolidatedFinancialMetrics(get('recipient'),'2024').receivedUsd,null)
 assert.equal(consolidatedFinancialMetrics(get('state')).receivedUsd,0,'internal transfers are excluded from the hierarchy')
 assert.equal(consolidatedFinancialMetrics(get('department')).receivedUsd,900)
 assert.equal(consolidatedFinancialMetrics(get('department')).disbursedUsd,15)
 assert.equal(consolidatedFinancialMetrics(get('department'),'2025').disbursedUsd,15)
 assert.equal(consolidatedFinancialMetrics(get('department'),'2024').disbursedUsd,null)
 assert.equal(consolidatedFinancialMetrics({}).disbursedUsd,null)
 assert.equal(consolidatedFinancialMetrics(get('heading')).receivedUsd,null)
 assert.equal(consolidatedFinancialMetrics({financialTotals:{currencies:[],missingAmounts:1}}).receivedUsd,null)
 assert.equal(consolidatedFinancialMetrics({}).receivedUsd,null,'older data is not silently reported as zero')
})
test('generic hierarchy rolls up documented children, not funding recipients; original agencies retain their records',()=>{
 const data=fixture(),profiles=organizationEvidenceProfiles(data),state=profiles.entries[profiles.aliases['example-state']],department=profiles.entries[profiles.aliases.department]
 assert.deepEqual(state.children.map(x=>x.id),['heading','department'])
 assert.deepEqual(department.parents.map(x=>x.id),['state'])
 assert.equal(state.children.find(x=>x.id==='department').recordCount,3)
 assert.deepEqual(state.recordIndices,[0,1,2,3]);assert.deepEqual(department.recordIndices,[0,1,2])
 assert.equal(department.groups.find(x=>x.kind==='approval').count,1)
 assert.equal(state.children.some(x=>x.id==='recipient'),false)
})
test('same-name organizations are separate, ambiguous slug lookup fails closed, mirrors are counted once',()=>{
 const data=fixture();data.organizations.push({id:'unrelated',name:'Department',portalSlug:'example-state'});data.relationships.push({...data.relationships[1]})
 const profiles=organizationEvidenceProfiles(data)
 assert.equal(profiles.aliases['example-state'],null)
 assert.equal(profiles.entries[profiles.aliases.department].recordIndices.length,3)
 assert.equal(profiles.entries[profiles.aliases.unrelated].recordIndices.length,0)
})
test('source code attachments are scoped, preserve signed evidence, and cannot override native identities',()=>{
 const base={organizations:[{id:'agency',name:'Agency'},{id:'other',name:'Agency'},{id:'source',name:'Old label',entityType:'source_label'}],relationships:[{id:'a',source:'source',target:'other',sourceLabel:'Old label',sourceRecordType:'external_financial_observation',sourceSystem:'system',sourceDataset:'payments',provenance:{agency_code:'A'},amount:-123}],financing:[]}
 const refs=[{system:'system',dataset:'payments',code:'A',organizationId:'agency',sourceUrl:'https://example.gov/agency'}]
 const result=attachSourceAgencies(base,refs)
 assert.equal(result.relationships[0].source,'agency');assert.equal(result.relationships[0].amount,-123);assert.equal(result.relationships[0].sourceAgency.label,'Old label');assert.equal(result.organizations.some(x=>x.id==='source'),false)
 for(const change of [{sourceDataset:'approvals'},{sourceSystem:'other'},{sourceIdentityId:'source'},{provenance:{agency_code:'unknown'}}])assert.equal(attachSourceAgencies({...base,relationships:[{...base.relationships[0],...change}]},refs).relationships[0].source,'source')
 assert.throws(()=>attachSourceAgencies(base,[...refs,{...refs[0],organizationId:'other'}]),/Ambiguous/)
})
test('Maryland BPW and MD-VIEW reference the same reviewed agency without combining their facts',()=>{
 const data={organizations:[{id:'housing',name:'Housing',governmentParentId:'research-state-maryland',budgetAgencyCode:'S00'},{id:'comptroller',name:'Comptroller',governmentParentId:'research-state-maryland',budgetAgencyCode:'E00'}],relationships:[],financing:[]}
 const refs=marylandAgencyReferences(data.organizations)
 assert.equal(refs.find(r=>r.dataset==='bpw'&&r.code==='COMP').organizationId,'comptroller')
 const rows=[['md-bpw:a','DHCD','reported_award',-5],['md-view:b','S00','disbursement',12]].map(([id,code,fact,amount])=>({id,record_id:id,record_type:'external_financial_observation',evidence:'maryland_comptroller',from_label:code==='DHCD'?'Housing and Community Development':'Housing & Community Development',to_label:'Unknown payee',amount,currency:'USD',financial_fact_type:fact,provenance_json:JSON.stringify({agency_code:code})}))
 const result=projectNativeEvidence(data,rows)
 assert.deepEqual(result.relationships.map(r=>r.source),['housing','housing'])
 assert.deepEqual(result.relationships.map(r=>r.kind),['approval','transfer'])
 assert.deepEqual(result.relationships.map(r=>r.amount),[-5,12])
 assert.equal(result.organizations.find(o=>o.id===result.relationships[0].target).identityStatus,'unverified_label')
 assert.equal(rows[0].from_organization_id,undefined)
})
test('public evidence endpoint resolves slug and ID, paginates, filters, and pins snapshots',async()=>{
 const data=fixture(),profiles=organizationEvidenceProfiles(data),read=async path=>{
  if(path==='manifest.json')return {version:'fixture',generatedAt:'2026-11-21',organizationEvidenceIndexVersion:1,temporalIndexVersion:1}
  if(path.endsWith('/index.json'))return profiles.aliases
  if(path.startsWith('fixture/organization-evidence/'))return profiles.entries.slice(Number(path.split('/').pop().replace('.json',''))*25,Number(path.split('/').pop().replace('.json',''))*25+25)
  if(path==='fixture/relationships/0.json')return data.relationships
  throw Error('Unexpected artifact '+path)
 }
 const first=await queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'department',limit:'1'}))
 assert.equal(first.body.total,3);assert.equal(first.body.records[0].id,'appropriation');assert.equal(first.body.nextOffset,1)
 assert.equal('recordIndices' in first.body,false)
 const next=await queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'department',offset:'1',limit:'1'}));assert.equal(next.body.records[0].id,'payment')
 const approvals=await queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'department',kind:'approval'}));assert.equal(approvals.body.total,1);assert.equal(approvals.body.records[0].amount,-10)
 const state=await queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'example-state'}));assert.equal(state.body.children.length,2)
 assert.equal((await queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'missing'}))).body.organization,null)
 assert.equal((await queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'state',version:'old'}))).status,409)
 await assert.rejects(queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'state',limit:'101'})),/Invalid limit/)
 assert.equal((await queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'state',fy:'2027'}))).body.total,0)
})

test('inspector ranks before pagination, honors years and grouping, and reads only the requested evidence page',async()=>{
 const organizations=[{id:'payer',name:'Payer'},{id:'child',name:'Child',governmentParentId:'payer'},{id:'recipient',name:'Recipient'},{id:'other',name:'Other'}]
 const relationships=Array.from({length:80},(_,i)=>({id:'tx-'+i,source:'child',target:'recipient',kind:'transfer',amount:i*100,currency:'USD',fiscalYear:2025}))
 relationships.push({id:'voided',source:'child',target:'recipient',kind:'transfer',amount:1e10,currency:'USD',fiscalYear:2025,status:'voided'},
  {id:'older',source:'child',target:'recipient',kind:'transfer',amount:1e9,currency:'USD',fiscalYear:2024},
  {id:'award',source:'child',target:'recipient',kind:'approval',amount:9000,currency:'USD',fiscalYear:2025,financialFactType:'reported_award'},
  {id:'adjustment',source:'child',target:'recipient',kind:'transfer',amount:-50,currency:'USD',fiscalYear:2025},
  {id:'unknown',source:'child',target:'recipient',kind:'transfer',amount:null,currency:'USD',fiscalYear:2025},
  {id:'euro',source:'child',target:'recipient',kind:'transfer',amount:1e9,currency:'EUR',fiscalYear:2025},
  {id:'unrelated',source:'other',target:'other',kind:'transfer',amount:1e12,currency:'USD',fiscalYear:2025})
 const profiles=organizationEvidenceProfiles({organizations,relationships}),ranks=transactionAmountRanks(relationships),calls=[]
 const read=async path=>{
  calls.push(path)
  if(path==='manifest.json')return {version:'bubble',generatedAt:'2026-11-23',organizationEvidenceIndexVersion:1,temporalIndexVersion:1}
  if(path==='bubble/organization-evidence/index.json')return profiles.aliases
  if(path==='bubble/organization-evidence/0.json')return profiles.entries
  if(path==='bubble/relationships/amount-ranks.json')return ranks
  const match=path.match(/^bubble\/relationships\/(\d+)\.json$/)
  if(match)return relationships.slice(Number(match[1])*25,Number(match[1])*25+25)
  throw Error('Unexpected artifact '+path)
 }
 const query=params=>queryEcosystem(read,'organization-evidence',new URLSearchParams({org:'payer',fy:'2025',sort:'amount-desc',limit:'2',...params}))
 const first=(await query()).body
 assert.deepEqual(first.records.map(r=>r.id),['award','tx-79']);assert.equal(first.nextOffset,2);assert.equal(first.total,84)
 assert.equal(calls.filter(path=>/relationships\/\d+/.test(path)).length,1,'fetch only the single shard containing the requested records')
 assert.deepEqual((await query({offset:'2'})).body.records.map(r=>r.id),['tx-78','tx-77'])
 assert.deepEqual((await query({offset:'80',limit:'10'})).body.records.map(r=>r.id),['tx-0','adjustment','unknown','euro'])
 assert.equal((await query({fy:'2024'})).body.records[0].id,'older')
 assert.equal((await query({fy:'2027'})).body.total,0)
 const group=(await query({org:'payer',members:JSON.stringify(['child','recipient'])})).body
 assert.equal(group.total,84,'overlapping group evidence must not duplicate transactions')
 assert.equal((await query({version:'old'})).status,409)
 await assert.rejects(query({sort:'random'}),/Invalid evidence sort/)
})
