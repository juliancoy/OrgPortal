import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runRetention } from '../src/retention.ts';
function adapter(sql) { return {prepare(q){return {bind(...v){return {async first(){return sql.prepare(q).get(...v);},async run(){return {meta:sql.prepare(q).run(...v)};}};}};}}; }

test('expiry units, bounds, dry-run, retries and unresolved operations',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../migrations/0017_event_mcp_operations.sql',import.meta.url),'utf8'));
 sql.exec(`CREATE TABLE email_oauth_states(state_hash TEXT PRIMARY KEY,expires_at INTEGER);
 CREATE TABLE private_newsletter_previews(id TEXT PRIMARY KEY,expires_at TEXT);
 CREATE TABLE local_newsletter_previews(id TEXT PRIMARY KEY,expires_at TEXT);`);
 const now=1800000000000,cutoff=now-23*3600000;
 const put=sql.prepare("INSERT INTO event_mcp_operations VALUES(?, 'actor','org','event','fingerprint',?,0,?,NULL,'[]')");
 for(const status of ['prepared','completed','executing','uncertain'])put.run(status,status,cutoff-1);
 put.run('boundary','prepared',cutoff);
 sql.prepare('INSERT INTO email_oauth_states VALUES (?,?)').run('expired',cutoff-1);
 sql.prepare('INSERT INTO email_oauth_states VALUES (?,?)').run('live',now+1000);
 for(let i=0;i<501;i++)sql.prepare('INSERT INTO private_newsletter_previews VALUES (?,?)').run(String(i),new Date(cutoff-1).toISOString());
 const db=adapter(sql) as unknown as D1Database;
 assert.equal((await runRetention(db,now,true)).private_newsletter_previews,501);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM email_oauth_states').get()!.n,2);
 const first=await runRetention(db,now);
 assert.equal(first.private_newsletter_previews,500);assert.equal(first.event_mcp_operations,2);assert.equal(first.email_oauth_states,1);
 assert.equal((await runRetention(db,now)).private_newsletter_previews,1);
 assert.equal((await runRetention(db,now)).private_newsletter_previews,0);
 assert.deepEqual(sql.prepare('SELECT id FROM event_mcp_operations ORDER BY id').all().map(r=>r.id),['boundary','executing','uncertain']);
 assert.equal(sql.prepare('SELECT state_hash FROM email_oauth_states').get()!.state_hash,'live');
 await assert.rejects(runRetention(db,NaN));sql.close();
});
