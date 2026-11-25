import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transactionTime} from '../web/src/features/ecosystem/transaction-time.js';
import {summarizeNodeObservations} from '../web/src/features/ecosystem/node-financial-observations.js';
import {summarizeOrganizationTransfers} from '../web/server/organization-financial-totals.mjs';
const path=process.argv[2];if(!path)throw Error('Supply normalized subaward evidence');
const raw=await readFile(path),data=JSON.parse(raw),rows=data.relationships.map(row=>({...row,...transactionTime(row)}));
const ids=new Set(rows.map(r=>r.id)),nodes=new Set(data.organizations.map(n=>n.id));
assert.equal(ids.size,rows.length);assert(rows.length>0);
assert(rows.every(r=>r.financialFactType==='reported_award'&&r.financialMeasure==='snapshot'&&r.annualAmountEligible===false&&Number.isFinite(r.amount)&&nodes.has(r.source)&&nodes.has(r.target)&&r.provenance.sourceSha256));
assert(rows.some(r=>/^Prime recipient not reported/.test(r.sourceLabel)));
assert(data.organizations.filter(n=>n.nameReported===false).every(n=>n.identityStatus==='unverified_label'||/^[A-Z0-9]{12}$/.test(n.identifiers?.uei||'')));
const sample=new Set(rows.slice(0,30).flatMap(r=>[r.source,r.target]));
for(const id of sample){assert.deepEqual(summarizeOrganizationTransfers(rows,[id]).currencies,[]);assert(summarizeNodeObservations(rows,id).every(g=>g.nonAdditive&&g.received===null&&g.disbursed===null));}
const sources=data.metadata[0].value.sources;
assert.equal(sources.reduce((n,s)=>n+s.records-s.duplicates-s.quarantinedRecords,0),rows.length);
console.log(JSON.stringify({sha256:createHash('sha256').update(raw).digest('hex'),records:rows.length,nodes:nodes.size,rawRows:sources.reduce((n,s)=>n+s.records,0),quarantined:sources.reduce((n,s)=>n+s.quarantinedRecords,0),cashAndAdditiveTotalsExcluded:true}));
