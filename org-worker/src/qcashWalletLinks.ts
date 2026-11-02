import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { sha3_256 } from '@noble/hashes/sha3.js'
import { walletProofMessage, type WalletChallenge } from '../../shared/qcashWalletProof'
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
const unhex=(s:string)=>Uint8Array.from(s.match(/../g)!,v=>parseInt(v,16))
const digest=z.string().regex(/^[0-9a-f]{64}$/)
const bad=(status:400|401|404|409|503,message:string):never=>{throw new HTTPException(status,{message})}
export async function qcashWalletSchemaAvailable(db:D1Database) {
 const row=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('qcash_wallet_links','qcash_wallet_challenges')").first<{n:number}>()
 return row?.n===2
}
export async function walletChallenge(db:D1Database,origin:string,userId:string,chainId:string,address:string,now=Date.now()) {
 digest.parse(address)
 if(!await db.prepare('SELECT user_id FROM user_contact_pages WHERE user_id=?').bind(userId).first())bad(400,'Create your portal profile before linking a wallet.')
 const current=await db.prepare('SELECT revision FROM qcash_wallet_links WHERE portal_origin=? AND user_id=? AND chain_id=?').bind(origin,userId,chainId).first<{revision:string}>()
 const challenge:WalletChallenge={challengeId:crypto.randomUUID(),portalOrigin:origin,userId,chainId,address,challengeExpiresAt:now+600000,linkExpiresAt:now+90*86400000,expectedRevision:current?.revision||'',publish:true}
 const message=walletProofMessage(challenge)
 await db.prepare(`INSERT INTO qcash_wallet_challenges(portal_origin,user_id,chain_id,challenge_id,address,message,expected_revision,expires_at,link_expires_at)
 VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(portal_origin,user_id,chain_id) DO UPDATE SET challenge_id=excluded.challenge_id,address=excluded.address,message=excluded.message,expected_revision=excluded.expected_revision,expires_at=excluded.expires_at,link_expires_at=excluded.link_expires_at`)
 .bind(origin,userId,chainId,challenge.challengeId,address,message,challenge.expectedRevision,challenge.challengeExpiresAt,challenge.linkExpiresAt).run()
 return {...challenge,message}
}
export async function saveWalletLink(db:D1Database,origin:string,userId:string,chainId:string,input:unknown,now=Date.now()) {
 const parsed=z.object({challengeId:z.string().uuid(),publicKey:z.string().regex(/^[0-9a-f]{3904}$/),signature:z.string().regex(/^[0-9a-f]{6618}$/)}).strict().safeParse(input)
 if(!parsed.success)bad(400,'Expected a wallet ownership signature; private keys are never accepted.')
 const p=parsed.data!
 const row=await db.prepare('SELECT * FROM qcash_wallet_challenges WHERE portal_origin=? AND user_id=? AND chain_id=? AND challenge_id=? AND expires_at>?').bind(origin,userId,chainId,p.challengeId,now)
 .first<{address:string;message:string;expected_revision:string;expires_at:number;link_expires_at:number}>()
 if(!row)bad(409,'Wallet challenge expired or was replaced. Review linking again.')
 const challenge=row!
 const key=unhex(p.publicKey),prefix=new TextEncoder().encode('pqcoin/address/ML-DSA-65/v1\0')
 const addressInput=new Uint8Array(prefix.length+key.length);addressInput.set(prefix);addressInput.set(key,prefix.length)
 if(hex(sha3_256(addressInput))!==challenge.address || !ml_dsa65.verify(unhex(p.signature),new TextEncoder().encode(challenge.message),key))bad(400,'Wallet ownership proof is invalid.')
 const results=await db.batch([
  db.prepare(`INSERT INTO qcash_wallet_links(portal_origin,user_id,chain_id,address,revision,public_key,signature,proof_message,linked_at,expires_at)
   SELECT portal_origin,user_id,chain_id,address,challenge_id,?,?,message,?,link_expires_at FROM qcash_wallet_challenges c
   WHERE portal_origin=? AND user_id=? AND chain_id=? AND challenge_id=? AND expires_at>?
   AND expected_revision=COALESCE((SELECT revision FROM qcash_wallet_links l WHERE l.portal_origin=c.portal_origin AND l.user_id=c.user_id AND l.chain_id=c.chain_id),'')
   ON CONFLICT(portal_origin,user_id,chain_id) DO UPDATE SET address=excluded.address,revision=excluded.revision,public_key=excluded.public_key,signature=excluded.signature,proof_message=excluded.proof_message,linked_at=excluded.linked_at,expires_at=excluded.expires_at`)
   .bind(p.publicKey,p.signature,now,origin,userId,chainId,p.challengeId,now),
  db.prepare('DELETE FROM qcash_wallet_challenges WHERE portal_origin=? AND user_id=? AND chain_id=? AND challenge_id=?').bind(origin,userId,chainId,p.challengeId),
 ])
 if(results[0].meta.changes!==1)bad(409,'Wallet link changed. Review linking again.')
 return {address:challenge.address,revision:p.challengeId,expiresAt:challenge.link_expires_at}
}
export async function removeWalletLink(db:D1Database,origin:string,userId:string,chainId:string) {
 await db.batch([
 db.prepare('DELETE FROM qcash_wallet_challenges WHERE portal_origin=? AND user_id=? AND chain_id=?').bind(origin,userId,chainId),
 db.prepare('DELETE FROM qcash_wallet_links WHERE portal_origin=? AND user_id=? AND chain_id=?').bind(origin,userId,chainId),
 ])
}
export async function walletRecipients(db:D1Database,origin:string,chainId:string,query:string,userId?:string,now=Date.now()) {
 return (await db.prepare(`SELECT p.user_id AS userId,COALESCE(p.user_name,p.slug) AS name,p.slug AS profileSlug,l.address,l.revision,l.expires_at AS expiresAt,
 l.public_key AS publicKey,l.signature,l.proof_message AS proofMessage FROM qcash_wallet_links l
 JOIN user_contact_pages p ON p.user_id=l.user_id WHERE l.portal_origin=? AND l.chain_id=? AND l.expires_at>? AND p.enabled=1
 AND ${userId?'p.user_id=?':"instr(lower(COALESCE(p.user_name,'') || ' ' || p.slug),lower(?))>0"}
 ORDER BY lower(p.user_name),p.slug LIMIT ${userId?1:10}`).bind(origin,chainId,now,userId||query).all()).results
}
export function qcashWalletRoutes(actor:(env:Env,request:Request)=>Promise<{id:string}>, originFor:(env:Env,request:Request)=>Promise<string>=async(_env,request)=>new URL(request.url).origin) {
 const app=new Hono<{Bindings:Env;Variables:{portalOrigin:string}}>()
 app.onError((error,c)=>c.json({error:error instanceof HTTPException?error.message:'QCash profile linking is unavailable.'},error instanceof HTTPException?error.status:503))
 app.use('*',bodyLimit({maxSize:12000}),async(c,next)=>{
  c.header('Cache-Control','no-store')
  if(c.env.ORGANIZATION_REPLICA_SOURCE)bad(503,'Wallet profile links require the primary portal.')
  if(!digest.safeParse(c.env.QCASH_CHAIN_ID || c.env.PQCOIN_CHAIN_ID).success || !await qcashWalletSchemaAvailable(c.env.DB))bad(503,'QCash profile linking is not configured.')
  c.set('portalOrigin',new URL(await originFor(c.env,c.req.raw)).origin)
  await next()
 })
 app.get('/me',async c=>{
  const user=await actor(c.env,c.req.raw)
  return c.json(await c.env.DB.prepare('SELECT address,revision,expires_at AS expiresAt FROM qcash_wallet_links WHERE portal_origin=? AND user_id=? AND chain_id=? AND expires_at>?').bind(c.get('portalOrigin'),user.id,(c.env.QCASH_CHAIN_ID || c.env.PQCOIN_CHAIN_ID)!,Date.now()).first())
 })
 app.post('/challenge',async c=>{
  const user=await actor(c.env,c.req.raw),input=z.object({address:digest,publish:z.literal(true)}).strict().safeParse(await c.req.json().catch(()=>null))
  if(!input.success)bad(400,'Review publishing your wallet address before linking.')
  return c.json(await walletChallenge(c.env.DB,c.get('portalOrigin'),user.id,(c.env.QCASH_CHAIN_ID || c.env.PQCOIN_CHAIN_ID)!,input.data!.address))
 })
 app.post('/verify',async c=>{const user=await actor(c.env,c.req.raw);return c.json(await saveWalletLink(c.env.DB,c.get('portalOrigin'),user.id,(c.env.QCASH_CHAIN_ID || c.env.PQCOIN_CHAIN_ID)!,await c.req.json().catch(()=>null)))})
 app.delete('/me',async c=>{const user=await actor(c.env,c.req.raw);await removeWalletLink(c.env.DB,c.get('portalOrigin'),user.id,(c.env.QCASH_CHAIN_ID || c.env.PQCOIN_CHAIN_ID)!);return c.json({removed:true})})
 app.get('/recipients',async c=>{
  await actor(c.env,c.req.raw);const query=(c.req.query('q')||'').trim()
  if(query.length<2 || query.length>80)return c.json({people:[]})
  return c.json({people:await walletRecipients(c.env.DB,c.get('portalOrigin'),(c.env.QCASH_CHAIN_ID || c.env.PQCOIN_CHAIN_ID)!,query)})
 })
 app.get('/recipients/:userId',async c=>{await actor(c.env,c.req.raw);const people=await walletRecipients(c.env.DB,c.get('portalOrigin'),(c.env.QCASH_CHAIN_ID || c.env.PQCOIN_CHAIN_ID)!,'',c.req.param('userId'));if(!people.length)bad(404,'Recipient has no current shared QCash wallet.');return c.json(people[0])})
 return app
}
