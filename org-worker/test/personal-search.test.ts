import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { personalizeSearch, type SearchResults } from '../src/personalSearch';

test('personal search ranks only supplied public candidates using the verified account’s live signals', async () => {
  const db = new EventTestDb();
  try {
    await db.prepare('CREATE TABLE event_registrations(event_id TEXT,user_id TEXT)').run();
    await db.prepare('CREATE TABLE user_connections(requester_user_id TEXT,recipient_user_id TEXT,status TEXT)').run();
    await db.prepare('CREATE TABLE user_contact_pages(user_id TEXT PRIMARY KEY,enabled INTEGER)').run();
    await db.prepare("INSERT INTO organizations(id,name,slug) VALUES ('a','Club Alpha','club-alpha'),('b','Club Beta','club-beta'),('private','Club Private','club-private')").run();
    await db.prepare("INSERT INTO organization_memberships VALUES ('b','alice','member','active'),('a','bob','member','active')").run();
    await db.prepare("INSERT INTO events(id,ingest_key,title,slug,host_org_id,created_at,updated_at) VALUES ('ea','ea','Club Meeting','ea','a','',''),('eb','eb','Club Meeting','eb','b','',''),('private-event','pe','Club Meeting','private-event','private','','')").run();
    await db.prepare("INSERT INTO event_registrations VALUES ('eb','alice')").run();
    await db.prepare("INSERT INTO user_contact_pages VALUES ('pa',1),('pb',1),('private-person',0)").run();
    await db.prepare("INSERT INTO user_connections VALUES ('alice','pb','accepted'),('alice','private-person','accepted'),('alice','pa','pending')").run();
    const publicResults: SearchResults = {
      orgs:[{id:'a',name:'Club Alpha'},{id:'b',name:'Club Beta'}],
      events:[{id:'ea',title:'Club Meeting'},{id:'eb',title:'Club Meeting'}],
      users:[{user_id:'pa',user_name:'Club Person'},{user_id:'pb',user_name:'Club Person'}],
    };
    const alice = await personalizeSearch(db as unknown as D1Database,'alice','club',publicResults);
    assert.deepEqual(alice.orgs.map(row=>row.id),['b','a']);
    const popularPublicResults = {...publicResults,orgs:[{...publicResults.orgs[0],membership_count:10000},publicResults.orgs[1]]};
    assert.equal((await personalizeSearch(db as unknown as D1Database,'alice','club',popularPublicResults)).orgs[0].id,'b');
    assert.deepEqual(alice.events.map(row=>row.id),['eb','ea']);
    assert.deepEqual(alice.users.map(row=>row.user_id),['pb','pa']);
    const bob = await personalizeSearch(db as unknown as D1Database,'bob','club',publicResults);
    assert.deepEqual(bob.orgs.map(row=>row.id),['a','b']);
    assert.deepEqual(bob.users,publicResults.users);
    assert.deepEqual(publicResults.orgs.map(row=>row.id),['a','b']);
    assert.ok(!JSON.stringify(alice).includes('private'));
    assert.ok(!JSON.stringify(alice).includes('score') && !JSON.stringify(alice).includes('alice'));
    await db.prepare("UPDATE organization_memberships SET status='inactive' WHERE user_id='alice'").run();
    await db.prepare("DELETE FROM event_registrations WHERE user_id='alice'").run();
    await db.prepare("UPDATE user_connections SET status='declined' WHERE requester_user_id='alice'").run();
    assert.deepEqual(await personalizeSearch(db as unknown as D1Database,'alice','club',publicResults),publicResults);
    const moreActive = {...publicResults,orgs:[publicResults.orgs[0],{...publicResults.orgs[1],upcoming_events_count:20}]};
    assert.equal((await personalizeSearch(db as unknown as D1Database,'alice','club',moreActive)).orgs[0].id,'b');
    await db.prepare("INSERT INTO event_company_ballots(event_id,closes_at,mode) VALUES ('eb','2000-01-01','favorites')").run();
    await db.prepare("INSERT INTO event_pitch_companies VALUES ('eb','b')").run();
    await db.prepare("INSERT INTO event_company_favorites(event_id,organization_id,user_id,expires_at) VALUES ('eb','b','alice','2099-01-01')").run();
    assert.equal((await personalizeSearch(db as unknown as D1Database,'alice','club',publicResults)).orgs[0].id,'b');
    await db.prepare("UPDATE event_company_favorites SET expires_at='2000-01-01'").run();
    assert.deepEqual(await personalizeSearch(db as unknown as D1Database,'alice','club',publicResults),publicResults);
  } finally { db.close(); }
});
