/** Isolated loopback runner for the same adapter used by the Worker; no portal DB. */
import { createServer } from 'node:http'
import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { qcashWalletRoutes } from '../src/qcashWalletLinks'
import { HTTPException } from 'hono/http-exception'
import { pqcoinRoutes } from '../src/pqcoin'
const app=new Hono()
const env={PQCOIN_CHAIN_ID:process.env.QCASH_CHAIN_ID || process.env.PQCOIN_CHAIN_ID || '',PQCOIN_GATEWAY_URL:process.env.QCASH_GATEWAY_URL || process.env.PQCOIN_GATEWAY_URL || '',ENV:'development',QCASH_GATEWAY_TOKEN:process.env.QCASH_GATEWAY_TOKEN || ''}
const port=Number(process.env.PQCOIN_ADAPTER_PORT || '29703')
const portalOrigin=process.env.QCASH_TEST_PORTAL_ORIGIN || 'http://localhost'
if(!['localhost','127.0.0.1'].includes(new URL(portalOrigin).hostname))throw new Error('Local portal origin required')
if(process.env.QCASH_PROFILE_FIXTURE) {
 const {EventTestDb}=await import('../test/event-test-db')
 const db=new EventTestDb()
 await db.prepare('PRAGMA foreign_keys=ON').run()
 await db.prepare('CREATE TABLE user_contact_pages(user_id TEXT PRIMARY KEY,user_name TEXT,slug TEXT,enabled INTEGER)').run()
 await db.prepare('CREATE TABLE change_journal_exclusions(table_name TEXT PRIMARY KEY,reason TEXT)').run()
 for(const sql of readFileSync(new URL('../migrations/0130_qcash_profile_wallets.sql',import.meta.url),'utf8').split(';').filter(s=>s.trim()))await db.prepare(sql).run()
 const profiles=JSON.parse(readFileSync(process.env.QCASH_PROFILE_FIXTURE,'utf8')) as {userId:string;name:string;slug:string}[]
 for(const person of profiles)await db.prepare('INSERT INTO user_contact_pages VALUES(?,?,?,1)').bind(person.userId,person.name,person.slug).run()
 Object.assign(env,{DB:db})
 const identityBase=process.env.QCASH_LOCAL_PIDP_URL || ''
 const identityUrl=new URL(identityBase)
 if(identityUrl.protocol!=='http:' || !/^(127\.|172\.(1[6-9]|2[0-9]|3[01])\.|10\.|192\.168\.)/.test(identityUrl.hostname))throw new Error('Local Docker PIdP address required')
 app.route('/api/qcash/profile-wallet',qcashWalletRoutes(async(_env,request)=>{
  const authorization=request.headers.get('Authorization')
  if(!authorization)throw new HTTPException(401)
  const response=await fetch(identityBase+'/auth/me',{headers:{Authorization:authorization},signal:AbortSignal.timeout(5000)})
  if(!response.ok)throw new HTTPException(401)
  const user=await response.json() as {id:string;canonical_user_id:string;account_id:string;account_subject:string}
  if(!user.id || user.id!==user.canonical_user_id || !user.account_id || !user.account_subject)throw new HTTPException(401)
  return {id:user.id}
 }))
}
app.route('/api/qcash',pqcoinRoutes())
app.route('/api/pqcoin',pqcoinRoutes())
createServer(async(req,res)=>{
 try {
  const parts:Buffer[]=[];let length=0
  for await(const part of req){length+=part.length;if(length>12000){res.writeHead(413).end();return}parts.push(part)}
  const headers=new Headers()
  for(const [key,value]of Object.entries(req.headers))if(typeof value==='string' && !['host','connection','content-length'].includes(key))headers.set(key,value)
  const method=req.method || 'GET'
  const request=new Request(portalOrigin+req.url,{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(parts)}:{})})
  const response=await app.fetch(request,env)
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
 }catch {res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Local test adapter unavailable."}')}
}).listen(port,'127.0.0.1',()=>console.log(`Local testnet adapter: http://127.0.0.1:${port}`))
