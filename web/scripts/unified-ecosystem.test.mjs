import test from 'node:test';import assert from 'node:assert/strict';
import {projectNativeEvidence,exportUnifiedEcosystem,fetchPublicEvidenceJson} from './unified-ecosystem.mjs';
test('native observations retain signed amounts, separate approvals and source-label identities; nonfiscal edges survive',()=>{
 const input={organizations:[{id:'a',name:'Known'}],relationships:[{id:'mentor',source:'a',target:'a',kind:'mentoring',amount:null}],financing:[]};
 const common={record_type:'external_financial_observation',from_label:'Maryland agency',to_label:'Unverified payee',amount:-5,currency:'USD',status:'reported'};
 const result=projectNativeEvidence(input,[{...common,id:'md-bpw:1',record_id:'md-bpw:1',financial_fact_type:'reported_award'},{...common,id:'md-view:2',record_id:'md-view:2',financial_fact_type:'disbursement'}]);
 assert.equal(result.relationships.length,3);assert.equal(result.relationships[0].kind,'mentoring');assert.equal(result.relationships[1].kind,'approval');assert.equal(result.relationships[2].kind,'transfer');assert.equal(result.relationships[2].amount,-5);
 assert.equal(result.relationships[1].target,result.relationships[2].target);assert.notEqual(result.relationships[1].target,'a');assert.equal(result.organizations.find(o=>o.id===result.relationships[1].target).identityStatus,'unverified_label');assert.equal(result.transactionalCoverage.comptrollerRecords,2);
});
test('native source IDs replace their snapshot mirrors without double-counting and without label matching',()=>{
 const input={organizations:[{id:'a',name:'Same'},{id:'b',name:'Other'}],relationships:[{id:'original',source:'a',target:'b',kind:'transfer',amount:1}],financing:[]};
 const result=projectNativeEvidence(input,[{id:'support:bmoremedtech:original',record_id:'bmoremedtech:original',record_type:'organization_support',from_organization_id:'a',to_organization_id:'b',from_label:'Same',to_label:'Other',transaction_type:'services',amount:null,status:'reported'}]);
 assert.equal(result.relationships.length,1);assert.equal(result.relationships[0].id,'original');assert.equal(result.relationships[0].kind,'services');assert.equal(result.relationships[0].source,'a');
});
test('database export fails closed instead of falling back to archival files',async()=>{
 await assert.rejects(exportUnifiedEcosystem({fetcher:async()=>new Response('{}',{status:503})}),/503/);
});

test('large relationship search scans bounded shards and paginates without dropping non-fiscal records',async()=>{
 const {queryEcosystem}=await import('../server/ecosystem-query.mjs');
 const rows=[{id:'a',search:'mentoring source',date:'2026-01-01'},{id:'b',search:'payment source',date:'2026-02-01'},{id:'c',search:'mentoring source',date:'2026-03-01'}];
 const read=async path=>{
  if(path==='manifest.json')return {version:'fixture',generatedAt:'2026-11-03',transactionalCoverage:{datasetId:'db-fixture'}};
  if(path.endsWith('/index.json'))return {shards:[{path:'relationships/search-0.json',start:0},{path:'relationships/search-1.json',start:2}]};
  if(path.endsWith('search-0.json'))return {rows:rows.slice(0,2),filters:{kind:{mentoring:[0],transfer:[1]}},grams:{},gramCounts:{}};
  if(path.endsWith('search-1.json'))return {rows:rows.slice(2),filters:{kind:{mentoring:[0]}},grams:{},gramCounts:{}};
  if(path.endsWith('relationships/0.json'))return rows;
  throw Error('Unexpected read '+path);
 };
 const first=await queryEcosystem(read,'relationships',new URLSearchParams({q:'mentoring',limit:'1'})),second=await queryEcosystem(read,'relationships',new URLSearchParams({kind:'mentoring',offset:'1',limit:'1'}));
 assert.equal(first.body.total,2);assert.equal(first.body.records[0].id,'a');assert.equal(first.body.nextOffset,1);assert.equal(second.body.records[0].id,'c');assert.equal(first.body.transactionalCoverage.datasetId,'db-fixture');
});

test('native counterparty corrections override saved snapshot links rather than retaining stale identities',()=>{
 const input={organizations:[{id:'old',name:'Old'},{id:'new',name:'New'},{id:'recipient',name:'Recipient'}],relationships:[{id:'e',source:'old',target:'recipient',kind:'transfer',amount:1}],financing:[]};
 const result=projectNativeEvidence(input,[{id:'support:e',record_id:'e',record_type:'organization_support',from_organization_id:'new',to_organization_id:'recipient',from_label:'New',to_label:'Recipient',transaction_type:'transfer',amount:2,status:'reported'}]);
 assert.equal(result.relationships.length,1);assert.equal(result.relationships[0].source,'new');assert.equal(result.relationships[0].amount,2);
});

test('directory aliases require exact unique portal slugs and never matching names',()=>{
 const input={organizations:[{id:'source-org',name:'Same name',portalSlug:'verified-slug'}],relationships:[],financing:[]};
 const native=(id,from)=>({id,record_id:id,record_type:'organization_support',from_organization_id:from,to_organization_id:'recipient',from_label:'Same name',to_label:'Recipient',transaction_type:'collaboration',status:'reported'});
 const result=projectNativeEvidence(input,[native('linked','native-org'),native('unrelated','other-org')],[{id:'native-org',slug:'verified-slug',name:'Current name'},{id:'other-org',slug:'other-slug',name:'Same name'}]);
 assert.equal(result.relationships[0].source,'source-org');assert.equal(result.relationships[1].source,'other-org');assert.equal(result.organizations.find(o=>o.id==='source-org').name,'Current name');
});

test('not-applicable source records share a placeholder class while preserving every signed observation',()=>{
 const legacy='source-label:maryland_comptroller:recipient:legacy';
 const input={organizations:[{id:'agency',name:'Agency'},{id:legacy,name:'Not applicable',entityType:'source_label'}],relationships:[{id:'old',source:'agency',target:legacy,targetLabel:'Not applicable',amount:5}],financing:[{id:'old-financing',recipientId:legacy,amount:5}]};
 const records=['Not applicable','NOT APPLICABLE','N/A'].map((label,i)=>({id:'md-view:'+i,record_id:'record:'+i,record_type:'external_financial_observation',from_organization_id:'agency',to_label:label,amount:i===1?-10:20,currency:'USD'}));
 const result=projectNativeEvidence(input,records);
 const placeholders=result.organizations.filter(o=>o.nodeClass==='not-applicable');
 assert.equal(result.financing[0].recipientId,placeholders[0].id);assert.equal(result.financing[0].amount,5);
 assert.equal(placeholders.length,1);assert.equal(placeholders[0].entityType,'placeholder');assert.equal(placeholders[0].directory,false);
 assert.equal(result.relationships.length,4);assert.equal(new Set(result.relationships.map(e=>e.target)).size,1);
 assert.deepEqual(result.relationships.map(e=>e.targetLabel),['Not applicable',...records.map(r=>r.to_label)]);
 assert.deepEqual(result.relationships.map(e=>e.amount),[5,20,-10,20]);
 assert.equal(result.organizations.some(o=>o.id===legacy),false);
 const identified=projectNativeEvidence({organizations:[],relationships:[],financing:[]},[{...records[0],to_organization_id:'real-org',to_label:'Not applicable'}]);
 assert.equal(identified.relationships[0].target,'real-org');assert.equal(identified.organizations.find(o=>o.id==='real-org').entityType,'organization');
});

test('verified exports retry transient HTTP/network failures with a strict bound, but never retry conflicts or invalid evidence',async()=>{
 let attempts=0;const waits=[]
 const value=await fetchPublicEvidenceJson('https://example.invalid/public',{wait:async ms=>{waits.push(ms)},fetcher:async()=>{attempts++;if(attempts===1)throw new TypeError('network reset');return attempts===2?new Response('{}',{status:500}):Response.json({records:[]})}})
 assert.deepEqual(value,{records:[]});assert.equal(attempts,3);assert.deepEqual(waits,[500,1000])
 attempts=0;await assert.rejects(()=>fetchPublicEvidenceJson('https://example.invalid/public',{wait:async()=>{},fetcher:async()=>{attempts++;return new Response('{}',{status:503})}}),/503/);assert.equal(attempts,4)
 attempts=0;await assert.rejects(()=>fetchPublicEvidenceJson('https://example.invalid/public',{wait:async()=>{},fetcher:async()=>{attempts++;return new Response('{}',{status:409})}}),/409/);assert.equal(attempts,1)
 attempts=0;await assert.rejects(()=>fetchPublicEvidenceJson('https://example.invalid/public',{wait:async()=>{},fetcher:async()=>{attempts++;return new Response('{')}}));assert.equal(attempts,1)
})
