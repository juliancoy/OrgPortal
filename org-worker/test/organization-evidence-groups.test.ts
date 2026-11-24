import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventTestDb} from './event-test-db';
import {organizationEvidenceGrouping,changeOrganizationEvidenceGrouping} from '../src/organizationEvidenceGroups';
import {defaultEvidenceGroups,evidenceGroupSource,evidenceGroupExclusionSource} from '../../shared/organizationEvidenceGroups';
const actor={id:'pidp-user',name:'Fixture editor',email:null,isOperator:false};
function setup(){return new EventTestDb(`
 CREATE TABLE audit_events(id TEXT PRIMARY KEY,actor_user_id TEXT,action TEXT,resource_type TEXT,resource_id TEXT,metadata_json TEXT,created_at TEXT);
 CREATE TABLE organization_source_identities(source TEXT NOT NULL,external_id TEXT NOT NULL,organization_id TEXT NOT NULL REFERENCES organizations(id),PRIMARY KEY(source,external_id));
 CREATE TABLE ecosystem_public_datasets(id TEXT PRIMARY KEY,state TEXT); INSERT INTO ecosystem_public_datasets VALUES('published','active');
 CREATE TABLE ecosystem_public_records(dataset_id TEXT,collection TEXT,payload_json TEXT);
 INSERT INTO ecosystem_public_records VALUES('published','organizations','{"id":"source-one","name":"Source One"}'),('published','organizations','{"id":"source-two","name":"Source Two"}');
 ALTER TABLE ecosystem_public_records ADD COLUMN sha256 TEXT DEFAULT 'fixture-hash';
 CREATE TABLE master_transaction_records_before_ecosystem(from_label TEXT,to_label TEXT,record_type TEXT,evidence TEXT,from_organization_id TEXT,to_organization_id TEXT);
 CREATE TABLE external_financial_observations(id TEXT,source_system TEXT,recipient_label TEXT,agency_label TEXT,metadata_json TEXT,source_sha256 TEXT,source_url TEXT);
 `)}
const node={id:'source-one',name:'Source One'};
test('federal identity indexes avoid source-wide scans and preserve source data',async()=>{
 const db=setup();
 try{
  await db.prepare("INSERT INTO external_financial_observations VALUES('fixture','usaspending','Dummy','Dummy','{}','hash','https://example.test')").run();
  const sql=readFileSync(new URL('../migrations/0137_external_financial_identity_indexes.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  for(const [label,field,index] of [['recipient_label','recipient_uei','recipient'],['agency_label','awarding_agency_code','agency']]){
   const plan=await db.prepare(`EXPLAIN QUERY PLAN SELECT id,source_sha256,source_url FROM external_financial_observations WHERE source_system='usaspending' AND ${label}=? AND json_extract(metadata_json,'$.${field}')=? LIMIT 1`).bind('Dummy','dummy').all<{detail:string}>();
   assert(plan.results.some(row=>row.detail.includes(`external_usaspending_${index}_identity`)));
   assert(!plan.results.some(row=>row.detail.includes('SCAN ')||row.detail.includes('TEMP B-TREE')));
  }
  assert.equal((await db.prepare('SELECT count(*) n FROM external_financial_observations').first()).n,1);
 }finally{db.close()}
});
test('master federal identities absent from the older export require exact identifier and source label evidence',async()=>{
 const db=setup(),d1=db as unknown as D1Database;
 try{
  await db.prepare('INSERT INTO external_financial_observations VALUES(?,?,?,?,?,?,?)').bind('federal-row','usaspending','Example University','Example agency',JSON.stringify({recipient_uei:'ABCDEFGHIJK1',awarding_agency_code:'075'}),'federal-source-hash','https://www.usaspending.gov/award/example').run();
  for(const member of [{id:'usgov:recipient:ABCDEFGHIJK1',name:'Example University'},{id:'usgov:agency:075',name:'Example agency'}])await changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member});
  for(const member of [{id:'usgov:recipient:ABCDEFGHIJK2',name:'Example University'},{id:'usgov:recipient:ABCDEFGHIJK1',name:'Different name'},{id:'usgov:agency:999',name:'Example agency'}])await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member}),/existing public source/);
  const {evidenceGroupingHistory}=await import('../src/organizationEvidenceGroups');
  assert.equal((await evidenceGroupingHistory(d1,'org-one')).records[0].source.sha256,'federal-source-hash');
  assert.equal((await db.prepare('SELECT count(*) n FROM external_financial_observations').first()).n,1);
 }finally{db.close()}
});
test('automatic associations use server-recorded EINs and refuse conflicting nonprofit identities',async()=>{
 const db=setup(),d1=db as unknown as D1Database;
 try{
  await db.prepare("UPDATE organizations SET name='Johns Hopkins University' WHERE id='org-one'").run();
  const university={id:'nonprofit:520595110',name:'Johns Hopkins University'};
  const hospital={id:'nonprofit:520591656',name:'Johns Hopkins University'}; // A misleading source label must not defeat the EIN.
  for(const n of [university,hospital])await db.prepare("INSERT INTO ecosystem_public_records(dataset_id,collection,payload_json) VALUES('published','organizations',?)").bind(JSON.stringify(n)).run();
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',mode:'automatic',member:university}),/Confirm the organization EIN/);
  await changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member:university});
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',mode:'automatic',member:hospital}),/Different EINs/);
  const alias={id:'source-one',name:'University research source',identifiers:{ein:'52-0595110'}};
  await db.prepare("UPDATE ecosystem_public_records SET payload_json=? WHERE json_extract(payload_json,'$.id')='source-one'").bind(JSON.stringify(alias)).run();
  await changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',mode:'automatic',member:{id:alias.id,name:alias.name}});
  const {evidenceGroupingHistory}=await import('../src/organizationEvidenceGroups');
  const record=(await evidenceGroupingHistory(d1,'org-one')).records.find(r=>r.memberId===alias.id);
  assert.deepEqual(record?.match.eins,{organization:['520595110'],source:['520595110']});
  assert.deepEqual((await organizationEvidenceGrouping(d1,'org-one'))?.members,[university.id,alias.id]);
 }finally{db.close()}
});
test('automatic associations are durable, auditable, reversible, and suppressed after human removal',async()=>{
 const {evidenceGroupingHistory}=await import('../src/organizationEvidenceGroups');
 const db=setup(),d1=db as unknown as D1Database;
 const member={id:'source-one',name:'Board of Trustees of The Johns Hopkins University'};
 try{
  await db.prepare("UPDATE organizations SET name='Johns Hopkins University' WHERE id='org-one'").run();
  await db.prepare("UPDATE ecosystem_public_records SET payload_json=? WHERE json_extract(payload_json,'$.id')='source-one'").bind(JSON.stringify(member)).run();
  const input={action:'add',mode:'automatic',member};
  assert.deepEqual((await changeOrganizationEvidenceGrouping(d1,actor,'org-one',input))?.members,[member.id]);
  await changeOrganizationEvidenceGrouping(d1,actor,'org-one',input);
  const history=await evidenceGroupingHistory(d1,'org-one');assert.equal(history.records.length,1);
  assert.equal(history.records[0].method,'automatic');assert.equal(history.records[0].match.score,100);
  assert.equal(history.records[0].match.version,'organization-name-v1');assert.equal(history.records[0].source.datasetId,'published');
  assert(!JSON.stringify(history).includes(actor.id));
  await changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'remove',member});
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',input),/human removed/);
  assert.equal((await db.prepare('SELECT count(*) n FROM organization_source_identities WHERE source=?').bind(evidenceGroupExclusionSource).first()).n,1);
  await changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member});
  assert.equal((await db.prepare('SELECT count(*) n FROM organization_source_identities WHERE source=?').bind(evidenceGroupExclusionSource).first()).n,0);
  assert.equal((await evidenceGroupingHistory(d1,'org-one')).records.length,3);
  assert.equal((await db.prepare('SELECT count(*) n FROM ecosystem_public_records').first()).n,2);
 }finally{db.close()}
});
test('automatic matching rejects ambiguous targets, structural differences, forged names and permission loss',async()=>{
 const db=setup(),d1=db as unknown as D1Database;
 try{
  await db.prepare("UPDATE organizations SET name='Johns Hopkins University' WHERE id='org-one'").run();
  const member={id:'source-one',name:'THE JOHNS HOPKINS UNIVERSITY'};
  await db.prepare("UPDATE ecosystem_public_records SET payload_json=? WHERE json_extract(payload_json,'$.id')='source-one'").bind(JSON.stringify(member)).run();
  const input={action:'add',mode:'automatic',member};
  await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('other','Johns Hopkins University','other')").run();
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',input),/Ambiguous/);
  await db.prepare("UPDATE organizations SET name='Unrelated School' WHERE id='other'").run();
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{...input,member:{...member,name:'Johns Hopkins Hospital'}}),/requires review/);
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{...input,member:{...member,name:'Johns Hopkins University'}}),/Source name changed/);
  await db.prepare("UPDATE organization_memberships SET status='inactive'").run();
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',input),/management access/);
  assert.deepEqual((await organizationEvidenceGrouping(d1,'org-one'))?.members,[]);
 }finally{db.close()}
});
test('authorized reversible grouping preserves original organizations, source records and permissions',async()=>{
 const db=setup(),d1=db as unknown as D1Database;
 try{
  assert.deepEqual((await organizationEvidenceGrouping(d1,'one'))?.members,[]);
  const add=()=>changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member:node});
  assert.deepEqual((await add())?.members,['source-one']);await add();
  assert.equal((await organizationEvidenceGrouping(d1,node.id))?.slug,'one');
  assert.deepEqual((await changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'remove',member:node}))?.members,[]);
  assert.equal(await organizationEvidenceGrouping(d1,node.id),null);
  assert.equal((await db.prepare('SELECT count(*) n FROM ecosystem_public_records').first()).n,2);
  assert.equal((await db.prepare('SELECT count(*) n FROM organizations').first()).n,1);
  assert.equal((await db.prepare('SELECT role FROM organization_memberships').first()).role,'owner');
  assert.equal((await db.prepare("SELECT count(*) n FROM audit_events WHERE action='organization.evidence_group'").first()).n,3);
  assert.deepEqual((await db.prepare('SELECT external_id FROM organization_source_identities WHERE source=?').bind(evidenceGroupSource).all()).results.map(row=>row.external_id),['org-one']);
 }finally{db.close()}
});
test('denies other tenants, inactive editors, unknown nodes, directory merges, and conflicting group membership',async()=>{
 const db=setup(),d1=db as unknown as D1Database;
 try{
  await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('org-two','Two','two')").run();
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-two',{action:'add',member:node}),/management access/);
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member:{id:'missing',name:'Missing'}}),/existing public/);
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member:{id:'org-two',name:'Two'}}),/directory organizations/);
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'remove',member:{id:'org-one',name:'One'}}),/fixed center/);
  await changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member:node});
  await db.prepare("INSERT INTO organization_memberships VALUES('org-two','pidp-user','administrator','active')").run();
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-two',{action:'add',member:node}),/another grouping/);
  await db.prepare("UPDATE organization_memberships SET status='inactive' WHERE organization_id='org-one'").run();
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'remove',member:node}),/management access/);
  assert.deepEqual((await organizationEvidenceGrouping(d1,'one'))?.members,['source-one']);
 }finally{db.close()}
});
test('source label hashes and source systems are exact, not inferred by similar names',async()=>{
 const db=setup(),d1=db as unknown as D1Database;
 try{
  const name='EXAMPLE UTILITY',hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name)))].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
  const member={id:`source-label:maryland_comptroller:recipient:${hash}`,name};
  await db.prepare("INSERT INTO master_transaction_records_before_ecosystem VALUES('Agency',?,'external_financial_observation','maryland_comptroller',NULL,NULL)").bind(name).run();
  await changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member});
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member:{...member,name:'Example Utility'}}),/label does not match/);
  await assert.rejects(changeOrganizationEvidenceGrouping(d1,actor,'org-one',{action:'add',member:{...member,id:member.id.replace('maryland_comptroller','other_system')}}),/not in the public/);
 }finally{db.close()}
});
test('removing all initial BGE members persists an empty group and never restores defaults',async()=>{
 const db=setup(),d1=db as unknown as D1Database,id=Object.keys(defaultEvidenceGroups)[0];
 try{
  await db.prepare('INSERT INTO organizations(id,name,slug) VALUES(?,?,?)').bind(id,'BGE','bge').run();
  const operator={...actor,isOperator:true};
  assert.equal((await organizationEvidenceGrouping(d1,'bge'))?.members.length,7);
  for(const member of defaultEvidenceGroups[id])await changeOrganizationEvidenceGrouping(d1,operator,id,{action:'remove',member:{id:member,name:member}});
  assert.deepEqual((await organizationEvidenceGrouping(d1,'bge'))?.members,[]);
  assert.equal(await organizationEvidenceGrouping(d1,defaultEvidenceGroups[id][0]),null);
  assert.equal((await db.prepare('SELECT count(*) n FROM organization_source_identities WHERE source=?').bind(evidenceGroupSource).first()).n,1);
 }finally{db.close()}
});

test('MCP grouping edits require exact one-use previews and current permission',async()=>{
 const {runEvidenceGroupOperation}=await import('../src/organizationEvidenceGroups');
 const db=setup(),d1=db as unknown as D1Database,input={organizationId:'org-one',action:'add',member:node};
 try{
  await assert.rejects(runEvidenceGroupOperation(d1,actor,{...input,confirm:true}),/preview first/);
  const preview=await runEvidenceGroupOperation(d1,actor,input);
  assert.deepEqual((await organizationEvidenceGrouping(d1,'one'))?.members,[]);
  const apply={...input,confirm:true,previewId:preview.previewId};
  await assert.rejects(runEvidenceGroupOperation(d1,actor,{...apply,member:{id:'source-two',name:'Source Two'}}),/changed/);
  await assert.rejects(runEvidenceGroupOperation(d1,{...actor,id:'other'},apply),/management access/);
  await db.prepare("UPDATE organization_memberships SET status='inactive'").run();
  await assert.rejects(runEvidenceGroupOperation(d1,actor,apply),/management access/);
  await db.prepare("UPDATE organization_memberships SET status='active'").run();
  await runEvidenceGroupOperation(d1,actor,apply);
  assert.deepEqual((await organizationEvidenceGrouping(d1,'one'))?.members,['source-one']);
  await assert.rejects(runEvidenceGroupOperation(d1,actor,apply),/changed|used/);
  assert.equal((await db.prepare('SELECT count(*) n FROM ecosystem_public_records').first()).n,2);
 }finally{db.close()}
});

test('MCP transport enforces portal scopes and tenant boundaries for shared group edits',async t=>{
 const {generateKeyPair,exportJWK,SignJWT}=await import('jose');
 const {handleEventMcp}=await import('../src/eventMcp');
 const db=setup();t.after(()=>db.close());
 const resource='https://group.transport.test/api/org/mcp',issuer='https://group.identity.test';
 const {privateKey,publicKey}=await generateKeyPair('ES256'),jwk=await exportJWK(publicKey);
 t.mock.method(globalThis,'fetch',async()=>Response.json({keys:[jwk]}));
 const env={DB:db,MCP_PUBLIC_URL:resource,MCP_OAUTH_ISSUER:issuer,MCP_OAUTH_JWKS_URL:issuer+'/keys',MCP_SUBJECT_MAP_JSON:JSON.stringify({subject:actor.id}),MCP_RESOURCE_CONFIG_JSON:JSON.stringify({[resource]:{name:'One',organizationId:'org-one'}})} as unknown as Env;
 const call=async(name:string,args:Record<string,unknown>,scope='org:portal.read org:portal.write')=>{
  const token=await new SignJWT({scope}).setProtectedHeader({alg:'ES256'}).setSubject('subject').setIssuer(issuer).setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const response=await handleEventMcp(new Request(resource,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env);
  assert.equal(response.status,200);return (await response.json() as any).result;
 };
 const input={organizationId:'org-one',action:'add',member:node};
 assert.equal((await call('preview_organization_evidence_group',input,'org:portal.read')).isError,true);
 await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('org-two','Two','two')").run();
 await db.prepare("INSERT INTO organization_memberships VALUES('org-two','pidp-user','owner','active')").run();
 assert.equal((await call('preview_organization_evidence_group',{...input,organizationId:'org-two'})).isError,true);
 const preview=await call('preview_organization_evidence_group',input);assert.ok(!preview.isError,JSON.stringify(preview));
 assert.equal((await call('apply_organization_evidence_group',{...input,previewId:preview.structuredContent.previewId})).isError,true);
 const applied=await call('apply_organization_evidence_group',{...input,previewId:preview.structuredContent.previewId,confirm:true});assert.ok(!applied.isError,JSON.stringify(applied));
 assert.deepEqual(applied.structuredContent.group.members,['source-one']);
 const status=await call('get_organization_evidence_group_operation',{organizationId:'org-one',previewId:preview.structuredContent.previewId},'org:portal.read');assert.equal(status.structuredContent.status,'completed');
});
