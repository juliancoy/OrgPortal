import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { runEventOperation } from '../src/eventMcp';
const identity = { userId: 'pidp-user', scopes: ['org:events.read'] };
test('native discovery works without provider credentials with scoped pagination and native update fields', async () => {
 const db = new EventTestDb(); const env = { DB: db } as unknown as Env;
 try {
  for(let i=0;i<52;i++) await db.prepare("INSERT INTO events(id,ingest_key,title,slug,host_org_id,created_at,updated_at) VALUES(?,?,?,?,?,'now','now')").bind(`event-${String(i).padStart(3,'0')}`,`key-${i}`,`Title ${i}`,`slug-${i}`,i===51?'other':'org-one').run();
  const first:any=await runEventOperation(env,identity,'list',{organizationId:'org-one'});
  assert.equal(first.systemOfRecord,'orgportal'); assert.equal(first.events.length,50);
  const next:any=await runEventOperation(env,identity,'list',{organizationId:'org-one',cursor:first.nextCursor});
  assert.equal(next.events.length,1); assert.equal(next.nextCursor,undefined);
  const event:any=await runEventOperation(env,identity,'get',{organizationId:'org-one',eventId:'event-000'});
  assert.equal(event.nativeEvent.ingestKey,'key-0'); assert.equal(event.updateTool,'preview_org_event_changes');
  await assert.rejects(runEventOperation(env,identity,'get',{organizationId:'org-one',eventId:'event-051'}),/not hosted/);
  await assert.rejects(runEventOperation(env,{...identity,userId:'outsider'},'list',{organizationId:'org-one'}),/management access/);
  await assert.rejects(runEventOperation(env,identity,'list',{organizationId:'org-one',cursor:'provider-cursor'}),/cursor/);
  await assert.rejects(runEventOperation(env,identity,'list',{organizationId:'org-one',source:'provider'}),/not configured/);
  await assert.rejects(runEventOperation({...env,EVENT_INTEGRATIONS_JSON:'broken'},identity,'list',{organizationId:'org-one'}),/configuration is invalid/);
  await assert.rejects(runEventOperation({...env,EVENT_INTEGRATIONS_JSON:'{"org-one":{}}'},identity,'list',{organizationId:'org-one'}),/not configured/);
 } finally {db.close();}
});
