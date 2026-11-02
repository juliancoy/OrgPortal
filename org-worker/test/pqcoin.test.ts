import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pqcoinRoutes } from '../src/pqcoin'
const chain='ab'.repeat(32), address='cd'.repeat(32)
const env={PQCOIN_CHAIN_ID:chain,PQCOIN_GATEWAY_URL:'https://testnet.invalid'}
const network={currency:'QCash',name:'QCash Testnet',chainId:chain,height:6,tip:address,decimals:0,experimental:true}
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
const url=(path:string)=>'https://portal.invalid/api/pqcoin'+path

test('disabled testnet never fetches a gateway',async()=>{
 const app=pqcoinRoutes(async()=>{throw new Error('must not fetch')})
 assert.equal((await app.request(url('/network'),{},{})).status,503)
})
test('chain mismatch fails closed for signed transfers and reads',async()=>{
 let calls=0
 const app=pqcoinRoutes(async()=>{++calls;return response({...network,chainId:address})})
 assert.equal((await app.request(url('/transactions'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signedTransfer:'00'.repeat(5472)})},env)).status,503)
 assert.equal(calls,1)
})
test('private keys, wrong methods, arbitrary paths and oversized requests are rejected',async()=>{
 const app=pqcoinRoutes(async()=>{throw new Error('must not fetch')})
 assert.equal((await app.request(url('/transactions'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({privateKey:'secret'})},env)).status,400)
 assert.equal((await app.request(url('/transactions'),{method:'POST',body:'x'.repeat(12001)},env)).status,413)
 assert.equal((await app.request(url('/network'),{method:'POST'},env)).status,405)
 assert.equal((await app.request(url('/accounts/../../elsewhere'),{},env)).status,404)
 assert.equal((await app.request(url('/network?upstream=https://elsewhere.invalid'),{},env)).status,404)
})
test('bounded valid account response preserves exact integer strings without forwarding identity credentials',async()=>{
 let calls=0
 const app=pqcoinRoutes(async(input,init)=>{
  assert.equal(new Headers(init?.headers).has('Authorization'),false);assert.equal(init?.redirect,'error')
  ++calls
  return response(input.endsWith('/network')?network:{address,spendable:'9007199254740993',immature:'0',nonce:'0',transactions:[]})
 })
 const result=await app.request(url('/accounts/'+address),{headers:{Authorization:'Bearer do-not-forward'}},env)
 assert.equal(result.status,200);assert.equal((await result.json()).spendable,'9007199254740993');assert.equal(calls,2)
 assert.equal(result.headers.get('Cache-Control'),'no-store')
})
test('gateway cannot redirect, return another account or stream an unbounded payload',async()=>{
 for(const mode of ['account','oversize']) {
  const app=pqcoinRoutes(async(input)=>input.endsWith('/network')?response(network):response(mode==='account'?{address:chain,spendable:'0',immature:'0',nonce:'0',transactions:[]}:'x'.repeat(262145)))
  assert.equal((await app.request(url('/accounts/'+address),{},env)).status,503)
 }
})
test('valid signed submission is forwarded exactly once after network validation',async()=>{
 let submitted=0;const signed='00'.repeat(5472)
 const app=pqcoinRoutes(async(input,init)=>{
  if(input.endsWith('/network'))return response(network)
  ++submitted;assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),{signedTransfer:signed})
  return response({id:address,status:'pending',confirmations:0},202)
 })
 const result=await app.request(url('/transactions'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signedTransfer:signed})},env)
 assert.equal(result.status,202);assert.equal(submitted,1)
})


test('mounted adapter leaves organization replica writes blocked',async()=>{
 const {app}=await import('../src/index')
 const env={ORGANIZATION_REPLICA_SOURCE:'https://replica.invalid'} as Env
 const response=await app.request('http://localhost/api/pqcoin/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({privateKey:'never-accepted'})},env)
 assert.equal(response.status,503)
 const denied=await app.request('http://localhost/api/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},env)
 assert.equal(denied.status,403)
})

test('legacy gateway metadata is normalized without changing the chain identity',async()=>{
 const app=pqcoinRoutes(async()=>response({...network,currency:'PQT',name:'PQCoin Testnet'}))
 const result=await app.request('https://portal.invalid/api/qcash/network',{},env)
 assert.equal(result.status,200)
 assert.deepEqual(await result.json(),{...network,currency:'QCash',name:'QCash Testnet'})
})


test('hosted gateway uses only its service secret, never browser credentials',async()=>{
 let calls=0
 const app=pqcoinRoutes(async(input,init)=>{
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer isolated-gateway-test-token')
  ++calls
  return response(input.endsWith('/network')?network:{address,spendable:'0',immature:'0',nonce:'0',transactions:[]})
 })
 const result=await app.request(url('/accounts/'+address),{headers:{Authorization:'Bearer private-browser-session'}},{...env,QCASH_GATEWAY_TOKEN:'isolated-gateway-test-token'})
 assert.equal(result.status,200);assert.equal(calls,2)
 assert.equal(JSON.stringify(await result.json()).includes('isolated-gateway-test-token'),false)
})
