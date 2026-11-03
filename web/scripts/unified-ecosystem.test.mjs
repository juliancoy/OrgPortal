import test from 'node:test';import assert from 'node:assert/strict';
import {projectNativeEvidence,exportUnifiedEcosystem} from './unified-ecosystem.mjs';
test('native observations retain signed amounts, separate approvals and source-label identities; nonfiscal edges survive',()=>{
 const input={organizations:[{id:'a',name:'Known'}],relationships:[{id:'mentor',source:'a',target:'a',kind:'mentoring',amount:null}],financing:[]};
 const common={record_type:'external_financial_observation',from_label:'Maryland agency',to_label:'Unverified payee',amount:-5,currency:'USD',status:'reported'};
 const result=projectNativeEvidence(input,[{...common,id:'md-bpw:1',record_id:'md-bpw:1',financial_fact_type:'reported_award'},{...common,id:'md-view:2',record_id:'md-view:2',financial_fact_type:'disbursement'}]);
 assert.equal(result.relationships.length,3);assert.equal(result.relationships[0].kind,'mentoring');assert.equal(result.relationships[1].kind,'approval');assert.equal(result.relationships[2].kind,'transfer');assert.equal(result.relationships[2].amount,-5);
 assert.equal(result.relationships[1].target,result.relationships[2].target);assert.notEqual(result.relationships[1].target,'a');assert.equal(result.organizations.find(o=>o.id===result.relationships[1].target).identityStatus,'unverified_label');assert.equal(result.transactionalCoverage.comptrollerRecords,2);
});
test('native source IDs replace their snapshot mirrors without double-counting and without label matching',()=>{
 const input={organizations:[{id:'a',name:'Same'},{id:'b',name:'Other'}],relationships:[{id:'original',source:'a',target:'b',kind:'transfer',amount:1}],financing:[]};
 const result=projectNativeEvidence(input,[{id:'support:bmoremedtech:original',record_id:'bmoremedtech:original',record_type:'organization_support',from_label:'Same',to_label:'Other',transaction_type:'services',amount:null,status:'reported'}]);
 assert.equal(result.relationships.length,1);assert.equal(result.relationships[0].id,'original');assert.equal(result.relationships[0].kind,'services');assert.equal(result.relationships[0].source,'a');
});
test('database export fails closed instead of falling back to archival files',async()=>{
 await assert.rejects(exportUnifiedEcosystem({fetcher:async()=>new Response('{}',{status:503})}),/503/);
});
