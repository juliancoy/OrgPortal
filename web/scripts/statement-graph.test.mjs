import {test} from 'node:test'
import assert from 'node:assert/strict'
import {graphRelationships,financialNodeAmounts} from '../src/features/ecosystem/portal-ecosystem.js'
import {transactionAmountRanks} from '../src/features/ecosystem/transaction-amount-order.js'
import {summarizeOrganizationTransfers} from '../server/organization-financial-totals.mjs'
import {organizationEvidenceProfiles} from './organization-evidence.mjs'
import {transactionTime} from '../src/features/ecosystem/transaction-time.js'
test('Public annual revenue connects to the filer without inflating cash or funding volume',()=>{
 const data={organizations:['public','university','hospital'].map(id=>({id,name:id})),relationships:[
  {id:'tuition',source:'public',target:'university',kind:'revenue',financialFactType:'revenue',measurement:'period_total',periodStart:'2024-07-01',periodEnd:'2025-06-30',amount:1000,currency:'USD'},
  {id:'payment',source:'public',target:'hospital',kind:'transfer',financialFactType:'disbursement',amount:20,currency:'USD'},
  {id:'expense',source:'university',target:'public',kind:'expense',financialFactType:'expense',amount:900,currency:'USD'}]}
 assert.equal(graphRelationships(data).length,3)
 assert.equal(financialNodeAmounts(data).get('university'),undefined)
 assert.equal(financialNodeAmounts(data).get('hospital'),20)
 assert.deepEqual(transactionAmountRanks(data.relationships),[0,2,1])
 assert.deepEqual(summarizeOrganizationTransfers(data.relationships,['university']),{currencies:[],missingAmounts:0})
 assert.deepEqual(summarizeOrganizationTransfers([{...data.relationships[0],kind:'transfer'}],['university']),{currencies:[],missingAmounts:0})
 assert.equal(organizationEvidenceProfiles(data).entries.find(x=>x.organization.id==='university').recordIndices.length,2)
 assert.equal(transactionTime(data.relationships[0]).fiscalYear,2025)
 assert.equal(transactionTime(data.relationships[0]).datePrecision,'period')
})
