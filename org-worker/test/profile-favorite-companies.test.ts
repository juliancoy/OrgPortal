import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventTestDb } from './event-test-db';
import { profileFavoriteCompanies, setFavoriteCompaniesSharing } from '../src/profileFavoriteCompanies';

test('profile favorites require opt-in and a public profile, deduplicate, isolate accounts, and expire with votes', async () => {
  const db = new EventTestDb();
  const d1 = db as unknown as D1Database;
  try {
    await db.prepare('PRAGMA foreign_keys = ON').run();
    await db.prepare('CREATE TABLE user_contact_pages(user_id TEXT PRIMARY KEY)').run();
    await db.prepare('CREATE TABLE change_journal_exclusions(table_name TEXT PRIMARY KEY, reason TEXT)').run();
    const migration = readFileSync(new URL('../migrations/0083_profile_favorite_companies.sql', import.meta.url), 'utf8');
    for (const sql of migration.split(';').filter(s => s.trim())) await db.prepare(sql).run();
    await db.prepare("INSERT INTO user_contact_pages VALUES ('alice'),('bob')").run();
    await db.prepare("INSERT INTO organizations(id,name,slug) VALUES ('a','Alpha','alpha'),('b','Beta','beta'),('c','Expired','expired'),('d','Only an upvote','upvote')").run();
    await db.prepare("INSERT INTO events(id,ingest_key,title,slug,created_at,updated_at) VALUES ('one','one','One','one','',''),('two','two','Two','two','','')").run();
    await db.prepare("INSERT INTO event_company_ballots(event_id,closes_at,mode) VALUES ('one','2000-01-01','favorites'),('two','2000-01-01','favorites')").run();
    await db.prepare("INSERT INTO event_pitch_companies VALUES ('one','a'),('two','a'),('one','b'),('one','c'),('one','d')").run();
    await db.prepare("INSERT INTO event_company_favorites(event_id,organization_id,user_id,expires_at) VALUES ('one','a','alice','2099-01-01'),('two','a','alice','2099-01-01'),('one','b','bob','2099-01-01'),('one','c','alice','2000-01-01')").run();
    await db.prepare("INSERT INTO event_company_votes(event_id,organization_id,user_id,value,expires_at) VALUES ('one','d','alice',1,'2099-01-01')").run();
    assert.deepEqual(await profileFavoriteCompanies(d1,'alice',true,false), { public: false, companies: [] });
    const own = await profileFavoriteCompanies(d1,'alice',false,true);
    assert.deepEqual(own.companies.map(row => row.id), ['a']);
    await setFavoriteCompaniesSharing(d1,'alice',{public:true});
    assert.deepEqual((await profileFavoriteCompanies(d1,'alice',true,false)).companies, own.companies);
    assert.deepEqual((await profileFavoriteCompanies(d1,'alice',false,false)).companies, []);
    assert.deepEqual((await profileFavoriteCompanies(d1,'bob',true,false)).companies, []);
    await db.prepare("DELETE FROM event_company_favorites WHERE event_id='one' AND user_id='alice' AND organization_id='a'").run();
    assert.equal((await profileFavoriteCompanies(d1,'alice',true,false)).companies.length,1);
    await db.prepare("UPDATE event_company_favorites SET expires_at='2000-01-01' WHERE user_id='alice'").run();
    assert.deepEqual((await profileFavoriteCompanies(d1,'alice',true,false)).companies, []);
    await setFavoriteCompaniesSharing(d1,'alice',{public:false});
    assert.equal((await profileFavoriteCompanies(d1,'alice',true,false)).public,false);
    for (const payload of [null,[],{}, {public:'true'}, {public:true,user_id:'bob'}])
      await assert.rejects(() => setFavoriteCompaniesSharing(d1,'alice',payload));
    await db.prepare("DELETE FROM user_contact_pages WHERE user_id='alice'").run();
    assert.equal(await db.prepare("SELECT public FROM profile_favorite_company_settings WHERE user_id='alice'").first(),null);
  } finally { db.close(); }
});

test('public favorite endpoint hides private profiles even when event registration makes their contact page visible', async () => {
  const { app } = await import('../src/index');
  const db = new EventTestDb();
  try {
    for (const sql of readFileSync(new URL('../migrations/0001_contact_pages.sql', import.meta.url), 'utf8').split(';').filter(s => s.trim()))
      await db.prepare(sql).run();
    await db.prepare('CREATE TABLE profile_favorite_company_settings(user_id TEXT PRIMARY KEY, public INTEGER, updated_at TEXT)').run();
    await db.prepare('CREATE TABLE event_registrations(event_id TEXT, user_id TEXT)').run();
    await db.prepare("INSERT INTO user_contact_pages(id,user_id,slug,enabled) VALUES ('c','alice','alice',0)").run();
    await db.prepare("INSERT INTO events(id,ingest_key,title,slug,created_at,updated_at) VALUES ('pitch','pitch','Pitch','pitch','','')").run();
    await db.prepare("INSERT INTO event_registrations VALUES ('pitch','alice')").run();
    await db.prepare("INSERT INTO organizations(id,name,slug) VALUES ('a','Alpha','alpha')").run();
    await db.prepare("INSERT INTO event_company_ballots(event_id,closes_at,mode) VALUES ('pitch','2000-01-01','favorites')").run();
    await db.prepare("INSERT INTO event_pitch_companies VALUES ('pitch','a')").run();
    await db.prepare("INSERT INTO event_company_favorites(event_id,organization_id,user_id,expires_at) VALUES ('pitch','a','alice','2099-01-01')").run();
    await setFavoriteCompaniesSharing(db as unknown as D1Database,'alice',{public:true});
    const env = { DB: db, PUBLIC_PORTAL_BASE_URL:'https://portal.test' } as unknown as Env;
    const request = () => app.fetch(new Request('https://portal.test/api/network/users/public/alice/favorite-companies'),env);
    const privateResponse = await request();
    assert.equal(privateResponse.status,200);
    assert.equal(privateResponse.headers.get('cache-control'),'no-store');
    assert.deepEqual(await privateResponse.json(),{public:true,companies:[]});
    await db.prepare("UPDATE user_contact_pages SET enabled=1 WHERE user_id='alice'").run();
    const publicResponse = await request();
    assert.equal(publicResponse.status,200);
    assert.deepEqual(((await publicResponse.json()) as {companies:{id:string}[]}).companies.map(c=>c.id),['a']);
    assert.equal((await app.fetch(new Request('https://portal.test/api/network/contact/me/favorite-companies', {
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({public:true}),
    }),env)).status,401);
    await db.prepare("DELETE FROM user_contact_pages WHERE user_id='alice'").run();
    assert.equal((await request()).status,404);
  } finally { db.close(); }
});
