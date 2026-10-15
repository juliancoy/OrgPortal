import test from 'node:test';
import assert from 'node:assert/strict';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {readCurrentSchemaFileSync as readFileSync} from './helpers/currentSchema';
import {saveInitiative,publicInitiatives,initiativeAccess,initiativeSchema,initiativeHistory} from '../src/interventions';
import {newInitiative} from '../../shared/interventions';
const owner={id:'owner',name:'Owner',email:null,isOperator:false};
function setup(){const db=new TimebankDatabase();for(const name of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0087_ecosystem_initiatives.sql'])db.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('org','Steward','steward'),('other','Other','other'); INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('org','owner','owner','active')");return db}
const proposal=()=>({...newInitiative('org'),title:'Fixture permit pilot',outcome:'Reduce median processing time',metric:'Median processing time',nextAction:'Request the baseline dataset'});
test('requires live management access, reviewed preview and single-use receipt',async()=>{const db=setup();try{
 const initiative=proposal();assert.equal((await initiativeAccess(db.asD1(),owner)).organizations.length,1);
 await assert.rejects(saveInitiative(db.asD1(),{...owner,id:'stranger'},{operation:'save',initiative}));
 await assert.rejects(saveInitiative(db.asD1(),owner,{operation:'save',initiative,confirm:true}));
 const preview=await saveInitiative(db.asD1(),owner,{operation:'save',initiative});assert.equal((await publicInitiatives(db.asD1())).records.length,0);
 await assert.rejects(saveInitiative(db.asD1(),owner,{operation:'save',initiative:{...initiative,title:'Changed'},confirm:true,previewId:preview.previewId}));
 await saveInitiative(db.asD1(),owner,{operation:'save',initiative,confirm:true,previewId:preview.previewId});
 await assert.rejects(saveInitiative(db.asD1(),owner,{operation:'save',initiative,confirm:true,previewId:preview.previewId}));
 const records=(await publicInitiatives(db.asD1())).records;assert.equal(records.length,1);assert.equal(records[0].revision,1);assert.equal(records[0].organizationName,'Steward');
 }finally{db.sqlite.close()}});
test('authorization is rechecked and stale edits cannot overwrite current plans',async()=>{const db=setup();try{
 const initiative=proposal(),p=await saveInitiative(db.asD1(),owner,{operation:'save',initiative});
 db.sqlite.exec("UPDATE organization_memberships SET status='inactive' WHERE user_id='owner'");
 await assert.rejects(saveInitiative(db.asD1(),owner,{operation:'save',initiative,previewId:p.previewId,confirm:true}));
 db.sqlite.exec("UPDATE organization_memberships SET status='active' WHERE user_id='owner'");
 await saveInitiative(db.asD1(),owner,{operation:'save',initiative,previewId:p.previewId,confirm:true});
 const original={...initiative,revision:1},first=await saveInitiative(db.asD1(),owner,{operation:'save',initiative:original});
 const changed={...original,nextAction:'Publish the baseline'};const second=await saveInitiative(db.asD1(),owner,{operation:'save',initiative:changed});await saveInitiative(db.asD1(),owner,{operation:'save',initiative:changed,confirm:true,previewId:second.previewId});
 await assert.rejects(saveInitiative(db.asD1(),owner,{operation:'save',initiative:original,confirm:true,previewId:first.previewId}),/changed/);
 assert.equal((await initiativeHistory(db.asD1(),initiative.id)).records.length,2);
 }finally{db.sqlite.close()}});
test('requires evidence and measurements for authorized and completed work',()=>{
 assert(!initiativeSchema.safeParse({...proposal(),status:'active'}).success);
 const ready={...proposal(),baseline:60,target:30,unit:'days',baselineDate:'2026-01-01',targetDate:'2027-01-01',authority:'Responsible agency',authoritySourceUrl:'https://example.test/authority',facts:'Baseline reported by agency',factSourceUrl:'https://example.test/baseline',evidenceStatus:'reviewed',authorizationUrl:'https://example.test/organization-approval',status:'active'};
 assert(initiativeSchema.safeParse(ready).success);assert(!initiativeSchema.safeParse({...ready,status:'completed'}).success);
 assert(initiativeSchema.safeParse({...ready,status:'completed',current:30,measurementDate:'2026-10-14',result:'Pilot reached the target',resultSourceUrl:'https://example.test/results'}).success);
 assert(!initiativeSchema.safeParse({...proposal(),factSourceUrl:'javascript:alert(1)'}).success);
 assert(!initiativeSchema.safeParse({...proposal(),decisionDate:'2026-02-30'}).success);
});
test('deletion uses a preview, removes the plan and retains only minimal audit metadata',async()=>{const db=setup();try{
 const initiative=proposal(),p=await saveInitiative(db.asD1(),owner,{operation:'save',initiative});await saveInitiative(db.asD1(),owner,{operation:'save',initiative,confirm:true,previewId:p.previewId});
 const saved={...initiative,revision:1},del=await saveInitiative(db.asD1(),owner,{operation:'delete',initiative:saved});assert.equal((await publicInitiatives(db.asD1())).records.length,1);await saveInitiative(db.asD1(),owner,{operation:'delete',initiative:saved,confirm:true,previewId:del.previewId});assert.equal((await publicInitiatives(db.asD1())).records.length,0);
 const audit=db.sqlite.prepare("SELECT metadata_json FROM audit_events WHERE resource_type='ecosystem_initiative'").all();assert.equal(audit.length,2);assert.equal((await initiativeHistory(db.asD1(),initiative.id)).records.length,0);assert(audit.every(row=>!String(row.metadata_json).includes(initiative.title)));
 }finally{db.sqlite.close()}});

test('audit failure rolls back the initiative and its revision history',async()=>{const db=setup();try{
 const initiative=proposal(),p=await saveInitiative(db.asD1(),owner,{operation:'save',initiative});
 db.sqlite.exec("CREATE TRIGGER fail_initiative_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
 await assert.rejects(saveInitiative(db.asD1(),owner,{operation:'save',initiative,confirm:true,previewId:p.previewId}),/audit unavailable/);
 assert.equal((await publicInitiatives(db.asD1())).records.length,0);assert.equal((await initiativeHistory(db.asD1(),initiative.id)).records.length,0);
 }finally{db.sqlite.close()}});
