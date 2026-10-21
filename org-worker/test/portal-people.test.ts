import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { lookupPortalPeople } from '../src/portalPeople';
function fixture(t: {after:(fn:()=>void)=>void}) {
 const sql=new DatabaseSync(':memory:'); t.after(()=>sql.close());
 sql.exec(`CREATE TABLE user_contact_pages(user_id TEXT,user_name TEXT,user_email TEXT,photo_url TEXT,enabled INTEGER);
 CREATE TABLE organization_memberships(user_id TEXT,user_name TEXT,user_email TEXT);
 CREATE TABLE ledger_accounts(user_id TEXT,name TEXT,email TEXT,entity_type TEXT);`);
 const db={prepare:(query:string)=>({bind:(...args:unknown[])=>({all:async()=>({results:sql.prepare(query).all(...args as [])})})})} as unknown as D1Database;
 return {sql,db};
}
test('member lookup includes private profiles and portal participants without a public profile, deduplicated by account ID',async t=>{
 const {sql,db}=fixture(t);
 sql.exec(`INSERT INTO user_contact_pages VALUES('private','Private Taylor','private@example.test','https://example.test/avatar',0),('public','Public Taylor','public@example.test',NULL,1);
 INSERT INTO organization_memberships VALUES('private','Old Taylor','old@example.test'),('member','Member Taylor','member@example.test');
 INSERT INTO ledger_accounts VALUES('account','Account Taylor','account@example.test','individual'),('company','Company Taylor','company@example.test','organization');`);
 const result=await lookupPortalPeople(db,'Taylor');
 assert.deepEqual(result.people.map(p=>p.user_id),['account','member','private','public']);
 assert.equal(result.people.find(p=>p.user_id==='private')?.photo_url,'https://example.test/avatar');
 assert.equal((await lookupPortalPeople(db,'PRIVATE@EXAMPLE.TEST')).people[0].user_id,'private');
 assert.deepEqual((await lookupPortalPeople(db,'private@')).people,[]);
 assert.deepEqual((await lookupPortalPeople(db,'taylor private')).people.map(p=>p.user_id),['private']);
});
test('searches before pagination so older matching users are never excluded by a candidate cap',async t=>{
 const {sql,db}=fixture(t);
 const insert=sql.prepare('INSERT INTO user_contact_pages VALUES(?,?,?,?,0)');
 for(let n=0;n<1100;n++)insert.run(`person-${String(n).padStart(4,'0')}`,`Person ${String(n).padStart(4,'0')}`,`person${n}@example.test`,null);
 assert.equal((await lookupPortalPeople(db,'person1099@example.test')).people[0].user_id,'person-1099');
 const ids:string[]=[];let offset:number|null=0;
 while(offset!==null){const page=await lookupPortalPeople(db,'Person',100,offset);ids.push(...page.people.map(p=>p.user_id));offset=page.nextOffset}
 assert.equal(new Set(ids).size,1100);assert.equal(ids.length,1100);
 assert.deepEqual(await lookupPortalPeople(db,'x'),{people:[],nextOffset:null});
 assert.deepEqual((await lookupPortalPeople(db,"' OR 1=1 --")).people,[]);
});

test('lookup requires a valid portal session and validates query and pagination', async t => {
 const {app}=await import('../src/index');
 const {sql,db}=fixture(t);
 sql.exec("INSERT INTO user_contact_pages VALUES('private','Private Person','private@example.test',NULL,0)");
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async (_input,init)=>new Headers(init?.headers).get('Authorization')==='Bearer valid'
  ? Response.json({id:'viewer',canonical_user_id:'viewer',account_id:'viewer',account_subject:'owner:viewer'})
  : new Response('{}',{status:401});
 try {
  const environment={DB:db,PIDP_BASE_URL:'https://id.example.test'} as Env;
  const request=(query:string,authorized=true)=>app.request(`https://org.example.test/api/network/users/lookup?${query}`,authorized?{headers:{Authorization:'Bearer valid'}}:{},environment);
  assert.equal((await request('q=Private',false)).status,401);
  for(const query of ['q=x','q=Private&offset=-1','q=Private&limit=101'])assert.equal((await request(query)).status,400);
  const response=await request('q=Private');
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual((await response.json() as {people:{user_id:string}[]}).people.map(p=>p.user_id),['private']);
 } finally {globalThis.fetch=originalFetch}
});
