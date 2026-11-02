import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HTTPException } from 'hono/http-exception'
import { EventTestDb } from './event-test-db'
import { walletChallenge,saveWalletLink,removeWalletLink,walletRecipients,qcashWalletRoutes } from '../src/qcashWalletLinks'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { sha3_256 } from '@noble/hashes/sha3.js'
const origin='https://portal.invalid',chain='ab'.repeat(32),now=Date.now()
const hex=(b:Uint8Array)=>Buffer.from(b).toString('hex')
const keys=ml_dsa65.keygen(new Uint8Array(32).fill(7))
const address=hex(sha3_256(Buffer.concat([Buffer.from('pqcoin/address/ML-DSA-65/v1\0'),keys.publicKey])))
async function setup(){
 const db=new EventTestDb()
 await db.prepare('PRAGMA foreign_keys=ON').run()
 await db.prepare('CREATE TABLE user_contact_pages(user_id TEXT PRIMARY KEY,user_name TEXT,slug TEXT,enabled INTEGER)').run()
 await db.prepare('CREATE TABLE change_journal_exclusions(table_name TEXT PRIMARY KEY,reason TEXT)').run()
 for(const sql of readFileSync(new URL('../migrations/0130_qcash_profile_wallets.sql',import.meta.url),'utf8').split(';').filter(v=>v.trim()))await db.prepare(sql).run()
 await db.prepare("INSERT INTO user_contact_pages VALUES('alice','Same Name','alice',1),('bob','Same Name','bob',1),('private','Private','private',0)").run()
 return db
}
function proof(c:{challengeId:string;message:string}){return {challengeId:c.challengeId,publicKey:hex(keys.publicKey),signature:hex(ml_dsa65.sign(new TextEncoder().encode(c.message),keys.secretKey))}}
const rejects=(f:()=>Promise<unknown>,status:number)=>assert.rejects(f,e=>e instanceof HTTPException && e.status===status)
test('requires the wallet signature and consumes each subject/origin/chain-bound challenge once',async()=>{
 const db=await setup(),d=db as unknown as D1Database
 try {
  const c=await walletChallenge(d,origin,'alice',chain,address,now),p=proof(c)
  await rejects(()=>saveWalletLink(d,origin,'bob',chain,p,now),409)
  await rejects(()=>saveWalletLink(d,'https://other.invalid','alice',chain,p,now),409)
  await rejects(()=>saveWalletLink(d,origin,'alice','cd'.repeat(32),p,now),409)
  await rejects(()=>saveWalletLink(d,origin,'alice',chain,{...p,signature:'00'.repeat(3309)},now),400)
  await saveWalletLink(d,origin,'alice',chain,p,now)
  await rejects(()=>saveWalletLink(d,origin,'alice',chain,p,now),409)
  const people=await walletRecipients(d,origin,chain,'Same',undefined,now)
  assert.equal(people.length,1);assert.equal(people[0].userId,'alice');assert.equal(people[0].address,address)
 }finally{db.close()}
})
test('expiry, public profile consent, revocation and cross-tenant isolation apply immediately',async()=>{
 const db=await setup(),d=db as unknown as D1Database
 try {
  const c=await walletChallenge(d,origin,'alice',chain,address,now)
  await rejects(()=>saveWalletLink(d,origin,'alice',chain,proof(c),c.challengeExpiresAt),409)
  const c2=await walletChallenge(d,origin,'alice',chain,address,now);await saveWalletLink(d,origin,'alice',chain,proof(c2),now)
  assert.equal((await walletRecipients(d,'https://other.invalid',chain,'Same',undefined,now)).length,0)
  await db.prepare("UPDATE user_contact_pages SET enabled=0 WHERE user_id='alice'").run()
  assert.equal((await walletRecipients(d,origin,chain,'Same',undefined,now)).length,0)
  await db.prepare("UPDATE user_contact_pages SET enabled=1 WHERE user_id='alice'").run()
  assert.equal((await walletRecipients(d,origin,chain,'Same',undefined,c2.linkExpiresAt)).length,0)
  const c3=await walletChallenge(d,origin,'alice',chain,address,now)
  await removeWalletLink(d,origin,'alice',chain)
  await rejects(()=>saveWalletLink(d,origin,'alice',chain,proof(c3),now),409)
  assert.equal((await walletRecipients(d,origin,chain,'Same',undefined,now)).length,0)
 }finally{db.close()}
})
test('stale revisions, replaced challenges and profile deletion cannot resurrect a link',async()=>{
 const db=await setup(),d=db as unknown as D1Database
 try {
  const old=await walletChallenge(d,origin,'alice',chain,address,now)
  const current=await walletChallenge(d,origin,'alice',chain,address,now)
  await rejects(()=>saveWalletLink(d,origin,'alice',chain,proof(old),now),409)
  await saveWalletLink(d,origin,'alice',chain,proof(current),now)
  const stale=await walletChallenge(d,origin,'alice',chain,address,now)
  await db.prepare("UPDATE qcash_wallet_links SET revision='changed' WHERE user_id='alice'").run()
  await rejects(()=>saveWalletLink(d,origin,'alice',chain,proof(stale),now),409)
  await walletChallenge(d,origin,'alice',chain,address,now)
  await db.prepare("DELETE FROM user_contact_pages WHERE user_id='alice'").run()
  assert.equal((await db.prepare('SELECT count(*) AS n FROM qcash_wallet_links').first<{n:number}>())?.n,0)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM qcash_wallet_challenges').first<{n:number}>())?.n,0)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM change_journal_exclusions').first<{n:number}>())?.n,2)
 }finally{db.close()}
})
test('routes require live account identity, deny replicas and reject other-user/private-key payloads',async()=>{
 const db=await setup(),d=db as unknown as D1Database
 const app=qcashWalletRoutes(async(_env,request)=>{const id=request.headers.get('Authorization');if(!id)throw new HTTPException(401);return {id}})
 const env={DB:d,QCASH_CHAIN_ID:chain} as Env
 try {
  const req=(path:string,init:RequestInit={})=>app.request(origin+path,init,env)
  assert.equal((await req('/recipients?q=Same')).status,401)
  const bad=await req('/challenge',{method:'POST',headers:{Authorization:'alice','Content-Type':'application/json'},body:JSON.stringify({address,publish:true,userId:'bob'})})
  assert.equal(bad.status,400)
  assert.equal((await app.request(origin+'/me',{}, {...env,ORGANIZATION_REPLICA_SOURCE:'https://replica.invalid'})).status,503)
  assert.equal((await req('/verify',{method:'POST',headers:{Authorization:'alice','Content-Type':'application/json'},body:JSON.stringify({privateKey:'not accepted'})})).status,400)
 }finally{db.close()}
})
