import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { runEventEnrichmentOperation as run } from '../src/eventEnrichment';
const actor={id:'operator',name:'Operator',email:null,isOperator:true};
function setup(){const db=new TimebankDatabase();for(const migration of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));db.sqlite.prepare('INSERT INTO events(id,ingest_key,title,slug,starts_at) VALUES (?,?,?,?,?)').run('event','key','Demo','demo','2026-06-05T17:00:00-04:00');return db;}
const input={sourceUrl:'https://example.test/event',changes:{ends_at:'2026-06-05T20:00:00-04:00'}};
test('event metadata uses actor-bound previews and detects intervening edits',async()=>{const db=setup();try{
 await assert.rejects(()=>run(db.asD1(),{...actor,isOperator:false},'event',input));
 const preview=await run(db.asD1(),actor,'event',input);
 assert.equal(db.sqlite.prepare('SELECT ends_at FROM events').get()!.ends_at,null);
 db.sqlite.prepare('UPDATE events SET location=?').run('Changed');
 await assert.rejects(()=>run(db.asD1(),actor,'event',{...input,confirm:true,previewId:preview.previewId}));
 const current=await run(db.asD1(),actor,'event',input);
 await run(db.asD1(),actor,'event',{...input,confirm:true,previewId:current.previewId});
 assert.equal(db.sqlite.prepare('SELECT ends_at FROM events').get()!.ends_at,input.changes.ends_at);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM audit_events').get()!.n,1);
}finally{db.sqlite.close();}});
test('invalid end times and arbitrary event fields are rejected',async()=>{const db=setup();try{
 await assert.rejects(()=>run(db.asD1(),actor,'event',{...input,changes:{ends_at:'2026-06-05T15:00:00-04:00'}}));
 await assert.rejects(()=>run(db.asD1(),actor,'event',{...input,changes:{slug:'changed'}}));
}finally{db.sqlite.close();}});
