// Validate the reviewed source batch, including non-additive financial behavior.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {summarizeOrganizationTransfers} from '../web/server/organization-financial-totals.mjs';
import {summarizeNodeObservations} from '../web/src/features/ecosystem/node-financial-observations.js';
const folder=process.argv[2];if(!folder)throw Error('Supply the reviewed backfill folder');
const names=['detail','scan','audit','audit2013','university-audit','federal'];
const data={},fingerprints={};
for(const name of names){const raw=await readFile(join(folder,(name==='federal'?'federal-outside':name)+'-additions.json'));data[name]=JSON.parse(raw);fingerprints[name]=createHash('sha256').update(raw).digest('hex');}
const rows=names.flatMap(name=>data[name].relationships);
assert.equal(new Set(rows.map(r=>r.id)).size,rows.length,'Duplicate observation IDs');
assert.equal(data.detail.relationships.length,9743);
assert(data.detail.relationships.every(r=>r.kind==='expense_detail'&&r.provenance.sourceSha256&&r.provenance.recipientEin!==undefined));
assert(data.detail.organizations.every(n=>n.type==='Organization reported in nonprofit filing'));
assert.equal(data.scan.nonprofitProfiles.length,4);
for(const profile of data.scan.nonprofitProfiles)for(const [kind,key] of [['revenue','revenue'],['expense','expenses']]){
 assert.equal(data.scan.relationships.filter(r=>r.kind===kind&&r.provenance.filingId===profile.id).reduce((n,r)=>n+r.amount,0),profile[key]);
}
const health='reporting-group:johns-hopkins-health-system-affiliates',university='reporting-group:johns-hopkins-university-affiliates';
const sum=(source,kind,year)=>rows.filter(r=>r.kind===kind&&r.fiscalYear===year&&(kind==='revenue'?r.target:r.source)===source).reduce((n,r)=>n+r.amount,0);
assert.equal(sum(health,'revenue',2013),4959792000);assert.equal(sum(health,'expense',2013),4783993000);
assert.equal(sum(health,'revenue',2025),9639119000);assert.equal(sum(health,'expense',2025),9446367000);
assert.equal(rows.find(r=>r.source==='aggregate:public'&&r.target===health&&r.fiscalYear===2025).amount,119879000);
assert.equal(sum(university,'revenue',2026),9775326000);assert.equal(sum(university,'expense',2026),9252570000);
assert.deepEqual(data['university-audit'].metadata[0].value.reports.map(r=>r.fiscalYear),Array.from({length:30},(_,i)=>1997+i));
assert.equal(data.federal.relationships.length,409);
const reconciliation=JSON.parse(await readFile(join(folder,'federal-reconciliation.json')));assert.deepEqual(reconciliation,{collected:103826,marylandEligible:103417,outsideMaryland:409,existingNativeOverlap:9855,changed:[]});
assert(data.federal.relationships.every(r=>r.kind==='obligation'&&r.financialFactType==='obligation'&&r.id.startsWith('usaspending:transaction:')));
assert(data.federal.relationships.some(r=>r.amount<0),'Signed deobligations retained');
assert(data.federal.relationships.every(r=>r.fiscalYear>=2008&&r.fiscalYear<=2027));
for(const id of [health,university,'org-johns-hopkins-university','registry-9c4d09ac-0939-473e-990e-20ea7cabdcad','registry-a55f67fe-f0bb-4af0-aed7-c93b44075b5c']){
 assert.deepEqual(summarizeOrganizationTransfers(rows,[id]).currencies,[],'No new cash claims from statements, annual details, or obligations');
 assert(summarizeNodeObservations(data.detail.relationships,id).every(r=>!r.received&&!r.disbursed),'Annual detail is not another aggregate total');
}
console.log(JSON.stringify({records:rows.length,federalOutsideMaryland:409,nonprofitDetails:9743,scannedFilings:4,healthSystemYears:17,universityYears:30,sourceFingerprints:fingerprints,cashUnchanged:true}));
