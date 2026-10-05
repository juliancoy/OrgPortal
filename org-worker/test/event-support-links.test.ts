import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';
import {TimebankDatabase} from './helpers/timebankDatabase';import {linkEventSupportRecords} from '../src/eventSupportLinks';
test('authorized ingestion links existing evidence to an event, preserves provenance and rejects unrelated records',async()=>{
 const db=new TimebankDatabase();
 try {
  for(const name of ['0002_org_event_directories.sql','0057_organization_support.sql','0044_event_history.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
  db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('host','Host','host'),('startup','Startup','startup'); INSERT INTO events(id,ingest_key,title,slug,host_org_id,starts_at) VALUES('pitch','pitch','Pitch','pitch','host','2026-10-08T17:00:00-04:00'); INSERT INTO organization_support_records(id,from_organization_id,to_organization_id,from_label,to_label,support_kind,description,occurred_at,source_url,created_at,provenance_json) VALUES('record','host','startup','Host','Startup','collaboration','Pitch opportunity','2026-10-08','https://example.com','2026-10-05','[{\"source\":\"Original evidence\"}]')");
  const event={id:'pitch',title:'Pitch',host_org_id:'host',starts_at:'2026-10-08T17:00:00-04:00'};
  for(let i=0;i<2;i++)await linkEventSupportRecords(db.asD1(),event,['record'],'https://lifetech.fyi/events/pitch');
  const provenance=JSON.parse(db.sqlite.prepare("SELECT provenance_json FROM organization_support_records WHERE id='record'").get()!.provenance_json as string);assert.equal(provenance.length,2);assert.equal(provenance[0].source,'Original evidence');assert.equal(provenance[1].eventId,'pitch');
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM event_organizations WHERE organization_id='startup'").get()!.n,1);
  await assert.rejects(()=>linkEventSupportRecords(db.asD1(),{...event,host_org_id:'startup'},['record'],'https://lifetech.fyi/events/pitch'));
  await assert.rejects(()=>linkEventSupportRecords(db.asD1(),{...event,starts_at:'2026-10-09'},['record'],'https://lifetech.fyi/events/pitch'));
 }finally{db.sqlite.close();}
});
