import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {TimebankDatabase} from './helpers/timebankDatabase'
import {receiveAuthorizedChanges,sqliteSyncState,syncPage,pendingSqliteChanges,acknowledgeSqliteChanges} from '../src/ecosystemSyncStore'
function setup(){const db=new TimebankDatabase();db.sqlite.exec(readFileSync(new URL('../migrations/0068_ecosystem_sync.sql',import.meta.url),'utf8'));return db}
const change=(id:string,replicaId:string,counter:number,deleted=false)=>({id,replicaId,counter,entity:'funding',recordId:'swc-2026',deleted,value:deleted?null:{amount:600,id}})
test('late acknowledgements publish beyond existing cursors and repeated acknowledgements are inert',async()=>{
 const db=setup();try{
 await receiveAuthorizedChanges(db.asD1(),[change('offline','sqlite',1)],true)
 await receiveAuthorizedChanges(db.asD1(),[change('online','d1',2)])
 const first=await syncPage(db.asD1())
 await acknowledgeSqliteChanges(db.asD1(),['offline'])
 const next=await syncPage(db.asD1(),first.cursor)
 assert.deepEqual(next.changes.map(c=>c.id),['offline'])
 await acknowledgeSqliteChanges(db.asD1(),['offline'])
 assert.deepEqual((await syncPage(db.asD1(),next.cursor)).changes,[])
 }finally{db.sqlite.close()}
})
test('independent SQLite/D1 stores converge after concurrent edits, retransmission and deletion',async()=>{
 const a=setup(),b=setup();try{
 await receiveAuthorizedChanges(a.asD1(),[change('a','sqlite',1)],true);await receiveAuthorizedChanges(b.asD1(),[change('b','d1',1)])
 const outbound=await pendingSqliteChanges(a.asD1());const ids=await receiveAuthorizedChanges(b.asD1(),outbound);await acknowledgeSqliteChanges(a.asD1(),ids)
 await receiveAuthorizedChanges(a.asD1(),(await syncPage(b.asD1())).changes);assert.deepEqual(await sqliteSyncState(a.asD1()),await sqliteSyncState(b.asD1()));assert.equal((await pendingSqliteChanges(a.asD1())).length,0)
 await receiveAuthorizedChanges(a.asD1(),[change('delete','browser',2,true)]);await receiveAuthorizedChanges(b.asD1(),(await syncPage(a.asD1())).changes);await receiveAuthorizedChanges(b.asD1(),outbound);assert.equal((await sqliteSyncState(b.asD1()))['funding:swc-2026'].deleted,true)
 }finally{a.sqlite.close();b.sqlite.close()}
})
test('conflicting identity reuse rolls back the whole delivery and pending changes are not published',async()=>{
 const db=setup();try{await receiveAuthorizedChanges(db.asD1(),[change('a','sqlite',1)],true);assert.equal((await syncPage(db.asD1())).changes.length,0)
 await assert.rejects(()=>receiveAuthorizedChanges(db.asD1(),[change('new','d1',2),{...change('a','sqlite',1),value:{amount:800}}]));assert.equal((await pendingSqliteChanges(db.asD1())).length,1);assert.equal(Object.keys(await sqliteSyncState(db.asD1())).length,1)
 }finally{db.sqlite.close()}
})
