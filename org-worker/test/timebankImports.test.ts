import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { app } from '../src/index';
import { timebankDashboard, timebankAnalytics, createTimebankListing, proposeTimebankExchange, resolveTimebankExchange } from '../src/timebank';
import { importClaimDirectory, requestImportClaim, resolveImportClaim, withdrawImportClaim, claimedImportRecords, importedListings, importedListingImage } from '../src/timebankImports';
import { loadSnapshot, statements, minutes } from '../scripts/letsbmore-import.mjs';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { importFixture } from './helpers/timebankImportFixture';
const bob={id:'bob',name:'Bob',email:'bob@example.test'}, carol={id:'carol',name:'Carol',email:'carol@example.test'};
function fixture() {
 const db=new TimebankDatabase();const snapshot=importFixture();
 const execute=async(sql:string,params:unknown[]=[])=>{const s=db.sqlite.prepare(sql);return s.columns().length?s.all(...params as any[]):(s.run(...params as any[]),[]);};
 return {db,d1:db.asD1(),snapshot,execute};
}
const claim=(account_id:string)=>({id:randomUUID(),account_id,evidence:'A coordinator can verify this profile.'});
test('credit conversion preserves negative and fractional hours without rounding',()=>{
 assert.equal(minutes('37'),2220);assert.equal(minutes('-1.5'),-90);assert.equal(minutes('0.75'),45);assert.equal(minutes(null),null);assert.throws(()=>minutes('0.001'));assert.throws(()=>minutes('NaN'));
});
test('staging remains invisible until complete; retry verifies all source rows without duplicates',async()=>{
 const {db,d1,snapshot,execute}=fixture();
 for(const s of statements(snapshot).slice(0,3))await execute(s.sql,s.params);
 assert.equal((await importClaimDirectory(d1,bob.id,'bmoretimebank')).accounts.length,0);
 assert.throws(()=>db.sqlite.prepare('UPDATE timebank_import_batches SET ready=1').run(),/incomplete/);
 assert.equal((await loadSnapshot(snapshot,execute)).repeated,false);
 assert.equal((await loadSnapshot(snapshot,execute)).repeated,true);
 assert.equal((await importClaimDirectory(d1,bob.id,'bmoretimebank')).accounts.length,3);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM timebank_import_records').get()?.n,4);
 await assert.rejects(loadSnapshot({...snapshot,batch:{...snapshot.batch,source_sha256:'b'.repeat(64)}},execute),/differs/);
 db.sqlite.close();
});
test('a partial import with altered content cannot be published by matching counts',async()=>{
 const {db,snapshot,execute}=fixture();for(const s of statements(snapshot))await execute(s.sql,s.params);
 const altered=structuredClone(snapshot);altered.accounts[0].name='Incorrect source name';
 await assert.rejects(loadSnapshot(altered,execute),/content differs/);
 assert.equal(db.sqlite.prepare('SELECT ready FROM timebank_import_batches').get()?.ready,0);db.sqlite.close();
});
test('ready sources and claim audit cannot be edited or deleted',async()=>{
 const {db,d1,snapshot,execute}=fixture();await loadSnapshot(snapshot,execute);
 for(const sql of ["UPDATE timebank_import_accounts SET balance_minutes=999", "UPDATE timebank_import_records SET title='changed'",'DELETE FROM timebank_import_record_accounts','DELETE FROM timebank_import_assets','DELETE FROM timebank_import_accounts','UPDATE timebank_import_batches SET ready=0','DELETE FROM timebank_import_batches']){
  if(sql.includes('DELETE FROM timebank_import_assets'))continue;
  assert.throws(()=>db.sqlite.exec(sql),/immutable|snapshot differs/);
 }
 const c=claim(snapshot.accounts[0].id);await requestImportClaim(d1,bob,'bmoretimebank',c);
 assert.throws(()=>db.sqlite.exec('DELETE FROM timebank_import_claim_audit'),/append-only/);
 assert.throws(()=>db.sqlite.exec("UPDATE timebank_import_claim_audit SET detail='changed'"),/append-only/);db.sqlite.close();
});
test('directory exposes only discovery fields and scopes claims and history to the member and community',async()=>{
 const {db,d1,snapshot,execute}=fixture();await loadSnapshot(snapshot,execute);
 const directory=await importClaimDirectory(d1,bob.id,'bmoretimebank','Former');assert.equal(directory.accounts.length,1);
 assert.ok(!JSON.stringify(directory).includes('balance_minutes'));assert.ok(!JSON.stringify(directory).includes('profile_json'));
 assert.equal((await importClaimDirectory(d1,bob.id,'central')).accounts.length,0);
 assert.deepEqual(await claimedImportRecords(d1,bob.id,'bmoretimebank'),{account:null,records:[]});
 const c=claim(snapshot.accounts[0].id);await requestImportClaim(d1,bob,'bmoretimebank',c);
 assert.equal((await importClaimDirectory(d1,carol.id,'bmoretimebank')).claims.length,0);
 await assert.rejects(withdrawImportClaim(d1,carol.id,'bmoretimebank',c.id),{status:404});
 await assert.rejects(requestImportClaim(d1,carol,'central',claim(snapshot.accounts[0].id)),{status:409});db.sqlite.close();
});
test('competing claims resolve atomically; retries never duplicate the opening balance or historical hours',async()=>{
 const {db,d1,snapshot,execute}=fixture();await loadSnapshot(snapshot,execute);
 const b=claim(snapshot.accounts[0].id),c=claim(snapshot.accounts[0].id);
 await requestImportClaim(d1,bob,'bmoretimebank',b);await requestImportClaim(d1,carol,'bmoretimebank',c);
 await requestImportClaim(d1,bob,'bmoretimebank',b);
 await assert.rejects(requestImportClaim(d1,bob,'bmoretimebank',{...b,evidence:'Different evidence'}),{status:409});
 assert.equal((await timebankDashboard(d1,bob,'bmoretimebank')).account?.balance_minutes,0);
 await resolveImportClaim(d1,'alice','bmoretimebank',b.id,{status:'approved',review_note:'Verified with former coordinator.'});
 await resolveImportClaim(d1,'alice','bmoretimebank',b.id,{status:'approved',review_note:'Verified with former coordinator.'});
 assert.equal((await timebankDashboard(d1,bob,'bmoretimebank')).account?.balance_minutes,2220);
 assert.equal((await timebankDashboard(d1,bob,'central')).account?.balance_minutes,0);
 assert.equal((await claimedImportRecords(d1,bob.id,'bmoretimebank')).records.length,3);
 assert.equal((await importClaimDirectory(d1,carol.id,'bmoretimebank')).claims[0].status,'rejected');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM timebank_exchanges').get()?.n,0);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM timebank_import_claim_audit').get()?.n,4);
 const stats=await timebankAnalytics(d1,'bmoretimebank');assert.equal(stats.circulation_minutes,2220);assert.equal(stats.rewarded_minutes,0);
 await assert.rejects(requestImportClaim(d1,bob,'bmoretimebank',claim(snapshot.accounts[1].id)),{status:409});db.sqlite.close();
});
test('new confirmed exchanges adjust the approved opening balance once and leave Dena untouched',async()=>{
 const {db,d1,snapshot,execute}=fixture();await loadSnapshot(snapshot,execute);
 const before=db.sqlite.prepare('SELECT * FROM ledger_accounts').all();
 const c=claim(snapshot.accounts[0].id);await requestImportClaim(d1,bob,'bmoretimebank',c);await resolveImportClaim(d1,'alice','bmoretimebank',c.id,{status:'approved',review_note:'Verified.'});
 const listing=await createTimebankListing(d1,carol,{id:randomUUID(),kind:'offer',title:'Lesson',description:'A lesson',category:'Learning',minutes:60,visibility:'members'},'bmoretimebank');
 const exchange=await proposeTimebankExchange(d1,bob,{id:randomUUID(),listing_id:listing.id,minutes:60,note:'Completed'},'bmoretimebank');
 await resolveTimebankExchange(d1,carol.id,exchange.id,{status:'confirmed'},'bmoretimebank');
 assert.equal((await timebankDashboard(d1,bob,'bmoretimebank')).account?.balance_minutes,2160);
 assert.deepEqual(db.sqlite.prepare('SELECT * FROM ledger_accounts').all(),before);db.sqlite.close();
});
test('withdrawal allows a fresh claim, rejection moves no hours, and admins cannot approve themselves',async()=>{
 const {db,d1,snapshot,execute}=fixture();await loadSnapshot(snapshot,execute);
 const c=claim(snapshot.accounts[0].id);await requestImportClaim(d1,bob,'bmoretimebank',c);await withdrawImportClaim(d1,bob.id,'bmoretimebank',c.id);await withdrawImportClaim(d1,bob.id,'bmoretimebank',c.id);
 await assert.rejects(resolveImportClaim(d1,'alice','bmoretimebank',c.id,{status:'approved',review_note:'Verified.'}),{status:409});
 const fresh=claim(snapshot.accounts[0].id);await requestImportClaim(d1,bob,'bmoretimebank',fresh);
 await assert.rejects(resolveImportClaim(d1,bob.id,'bmoretimebank',fresh.id,{status:'approved',review_note:'Self review.'}),{status:403});
 await resolveImportClaim(d1,'alice','bmoretimebank',fresh.id,{status:'rejected',review_note:'Insufficient evidence.'});
 assert.equal((await timebankDashboard(d1,bob,'bmoretimebank')).account?.balance_minutes,0);db.sqlite.close();
});
test('unknown source balances stay unknown after approval',async()=>{
 const {db,d1,snapshot,execute}=fixture();await loadSnapshot(snapshot,execute);const c=claim(snapshot.accounts[2].id);
 await requestImportClaim(d1,bob,'bmoretimebank',c);await resolveImportClaim(d1,'alice','bmoretimebank',c.id,{status:'approved',review_note:'Verified.'});
 const dashboard=await timebankDashboard(d1,bob,'bmoretimebank');assert.equal(dashboard.account?.imported_balance_minutes,null);assert.equal(dashboard.account?.has_imported_account,true);
 assert.equal((await claimedImportRecords(d1,bob.id,'bmoretimebank')).account?.balance_minutes,null);db.sqlite.close();
});
test('imported board includes only advertised offers/requests and never exposes financial records',async()=>{
 const {db,d1,snapshot,execute}=fixture();await loadSnapshot(snapshot,execute);
 const rows=await importedListings(d1,bob.id,'bmoretimebank') as Record<string, unknown>[];assert.equal(rows.length,2);assert.ok(!JSON.stringify(rows).includes('Historical help'));assert.ok(!JSON.stringify(rows).includes('balance_minutes'));assert.ok('claimed_user_id' in rows[0]);assert.ok('claimed_user_name' in rows[0]);
 assert.equal((await importedListings(d1,bob.id,'central')).length,0);
 await assert.rejects(importedListingImage({DB:d1} as Env,bob.id,'central',snapshot.records[0].id),{status:404});db.sqlite.close();
});
test('HTTP import endpoints require authentication, enforce admin review and reject malformed claims',async()=>{
 const {db,d1,snapshot,execute}=fixture();await loadSnapshot(snapshot,execute);
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'bob',full_name:'Bob',email:bob.email});
 const env={DB:d1,PIDP_BASE_URL:'https://identity.example.test'};const auth={Authorization:'Bearer bob','X-Forwarded-Host':'bmoretimebank.codecollective.us'};
 try {
  for(const path of ['/accounts','/me','/review']) assert.equal((await app.request('http://localhost/api/timebank/imports'+path,{},env)).status,401);
  assert.equal((await app.request('http://localhost/api/timebank/imports/listings',{},env)).status,200);
  assert.equal((await app.request('http://localhost/api/timebank/imports/review',{headers:auth},env)).status,403);
  assert.equal((await app.request('http://localhost/api/timebank/imports/claims/'+randomUUID(),{method:'PATCH',headers:auth,body:'{}'},env)).status,403);
  const list=await app.request('http://localhost/api/timebank/imports/listings',{headers:auth},env);assert.equal(list.status,200);assert.equal(list.headers.get('cache-control'),'no-store');
  assert.equal((await app.request('http://localhost/api/timebank/imports/claims',{method:'POST',headers:auth,body:'{}'},env)).status,400);
 } finally {globalThis.fetch=original;db.sqlite.close();}
});
