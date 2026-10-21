// Local protocol simulator. It never impersonates OpenAI or persists credentials.
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.env.LOCAL_MCP_BASE;
assert(new URL(base).hostname === 'localhost' && new URL(base).protocol === 'https:');
const resource = base + '/api/org/mcp';
const prefix = '/chatgpt-simulator';
const attempts = new Map();
let sequence = 0;
const random = () => randomBytes(32).toString('base64url');
const html = body => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local ChatGPT MCP simulator</title><style>body{font:17px system-ui;max-width:760px;margin:4rem auto;padding:24px}a,button{display:inline-block;padding:12px;margin:8px}pre{white-space:pre-wrap}</style><h1>Local ChatGPT MCP simulator</h1><p>This is a local test client, independent of OpenAI. It uses the real local OAuth and MCP services.</p>${body}</html>`;
const safe = value => JSON.stringify(value).replaceAll('<','\\u003c');
async function request(url, options) {
  assert.equal(new URL(url).origin, base, 'Simulator requests must stay on the local gateway');
  return fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(20000) });
}
async function json(url, options) {
  const response = await request(url,options);
  assert(response.ok, `Local endpoint returned HTTP ${response.status}`);
  return response.json();
}
async function form(url, fields, client) {
  return request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',authorization:'Basic '+Buffer.from(client.client_id+':'+client.client_secret).toString('base64')},body:new URLSearchParams(fields)});
}
async function rpc(token,method,params, notification=false) {
  const response = await request(resource,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id:++sequence}),method,...(params?{params}:{})})});
  if(notification || response.status !== 200) return {status:response.status};
  const body = await response.text();
  const data = response.headers.get('content-type')?.includes('text/event-stream') ? JSON.parse(body.split('\n').find(line=>line.startsWith('data: ')).slice(6)) : JSON.parse(body);
  return {status:response.status,...data};
}
function checked(result) { assert.equal(result.status,200); assert(!result.error); assert(!result.result?.isError); return result.result; }
async function exercise(attempt,code) {
  const {client,metadata,verifier,scope}=attempt;
  const exchange={grant_type:'authorization_code',client_id:client.client_id,code,code_verifier:verifier,redirect_uri:base+prefix+'/callback',resource};
  for(const fields of [{...exchange,code_verifier:random()+random()},{...exchange,resource:base+'/wrong-resource'}]){
    const denied=await form(metadata.token_endpoint,fields,client);
    assert.equal(denied.status,400); assert.equal((await denied.json()).error,'invalid_grant');
  }
  const response=await form(metadata.token_endpoint,exchange,client);
  assert.equal(response.status,200,'Valid PKCE exchange failed');
  const tokens=await response.json();
  assert.equal(tokens.scope,scope); assert(tokens.access_token && tokens.refresh_token);
  const replay=await form(metadata.token_endpoint,exchange,client);
  assert.equal(replay.status,400); assert.equal((await replay.json()).error,'invalid_grant');
  const init=checked(await rpc(tokens.access_token,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'Local ChatGPT web-connection simulator',version:'1.0.0'}}));
  assert.equal(init.protocolVersion,'2025-06-18');
  assert.equal((await rpc(tokens.access_token,'notifications/initialized',undefined,true)).status,202);
  const tools=checked(await rpc(tokens.access_token,'tools/list')).tools;
  assert(tools.some(tool=>tool.name==='search_organization_directory'));
  const directory=checked(await rpc(tokens.access_token,'tools/call',{name:'search_organization_directory',arguments:{query:'local-mcp-fixture-does-not-exist',limit:5}}));
  const organizations=checked(await rpc(tokens.access_token,'tools/call',{name:'list_organizations',arguments:{}}));
  assert.deepEqual(organizations.structuredContent.organizations,[], 'Consent must not create memberships');
  assert.deepEqual(directory.structuredContent.organizations,[]);
  // Even a write-scoped grant cannot turn this synthetic ordinary member into an operator.
  const denied=await rpc(tokens.access_token,'tools/call',{name:'preview_directory_registration',arguments:{name:'Local fixture',website:'https://example.invalid',description:'Synthetic fixture',sourceUrl:'https://example.invalid'}});
  assert.equal(denied.result?.isError,true,'Domain permission or scope denial required');
  assert(JSON.stringify(denied.result.content).includes(scope.includes('org:portal.write')?'Operator access required':'Missing portal scope'),'Expected the actual live authorization denial');
  const refreshed=await form(metadata.token_endpoint,{grant_type:'refresh_token',refresh_token:tokens.refresh_token,resource},client);
  assert.equal(refreshed.status,200); const renewed=await refreshed.json();
  assert(renewed.refresh_token!==tokens.refresh_token,'Refresh tokens must rotate');
  checked(await rpc(renewed.access_token,'tools/list'));
  assert.equal((await form(metadata.revocation_endpoint,{token:renewed.refresh_token},client)).status,200);
  assert.equal((await rpc(renewed.access_token,'tools/list')).status,401,'Revoked access token must fail live introspection');
  assert.equal((await form(metadata.token_endpoint,{grant_type:'refresh_token',refresh_token:renewed.refresh_token,resource},client)).status,400);
  return {outcome:'passed',scope,checks:['discovery','dynamic confidential web-client registration','PKCE and resource binding','one-use authorization code','MCP initialization','tool discovery','directory search','membership read','scope/domain permission denial','refresh rotation','live revocation'],toolCount:tools.length,server:init.serverInfo.name};
}
createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');
  res.setHeader('referrer-policy','no-referrer');
  res.setHeader('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('content-type','text/html; charset=utf-8');
  try {
    const url=new URL(req.url,base);
    if(url.pathname===prefix || url.pathname===prefix+'/'){
      res.end(html(`<p><a href="${prefix}/start?mode=read">Connect with read access</a><a href="${prefix}/start?mode=write">Connect with write scope</a><a href="${prefix}/start?mode=other">Connect from another browser</a></p>`));return;
    }
    if(url.pathname===prefix+'/start'){
      const probe=await request(resource,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:0,method:'tools/list'})});
      assert.equal(probe.status,401);
      const metadataUrl=/resource_metadata="([^"]+)"/.exec(probe.headers.get('www-authenticate')||'')?.[1];
      assert(metadataUrl,'MCP must advertise protected-resource discovery');
      const protectedResource=await json(metadataUrl);
      assert.equal(protectedResource.resource,resource); assert.deepEqual(protectedResource.authorization_servers,[base]);
      const metadata=await json(base+'/.well-known/oauth-authorization-server');
      assert.equal(metadata.issuer,base); assert(metadata.code_challenge_methods_supported.includes('S256'));
      const scope=url.searchParams.get('mode')==='write'?'org:portal.read org:portal.write':'org:portal.read';
      const client=await json(metadata.registration_endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Local ChatGPT web simulator',redirect_uris:[base+prefix+'/callback'],token_endpoint_auth_method:'client_secret_basic',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope})});
      assert(client.client_id && client.client_secret);
      const state=random(),verifier=random()+random();
      attempts.set(state,{client,metadata,state,verifier,scope,expires:Date.now()+600000});
      res.setHeader('set-cookie',`mcp_simulator_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=${prefix}; Max-Age=600`);
      const authorize=new URL(metadata.authorization_endpoint);
      authorize.search=new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:base+prefix+'/callback',resource,scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...(url.searchParams.get('mode')==='other'?{browser:'other'}:{})});
      res.writeHead(303,{location:authorize.toString()});res.end();return;
    }
    if(url.pathname===prefix+'/callback'){
      const state=url.searchParams.get('state')||'';
      const cookie=/mcp_simulator_state=([^;]+)/.exec(req.headers.cookie||'')?.[1]||'';
      assert(state.length===cookie.length && timingSafeEqual(Buffer.from(state),Buffer.from(cookie)),'OAuth state mismatch');
      const attempt=attempts.get(state); attempts.delete(state);
      assert(attempt && attempt.expires>Date.now(),'Expired or replayed OAuth state');
      assert.equal(url.searchParams.get('iss'),base,'OAuth issuer mismatch');
      res.setHeader('set-cookie',`mcp_simulator_state=; HttpOnly; Secure; SameSite=Lax; Path=${prefix}; Max-Age=0`);
      const result=url.searchParams.get('error') ? (assert.equal(url.searchParams.get('error'),'access_denied'),assert(!url.searchParams.has('code')),{outcome:'denied',checks:['user denied consent','no token issued']}) : await exercise(attempt,url.searchParams.get('code'));
      res.end(html(`<h2>${result.outcome==='passed'?'Connection test passed':'Access denied as requested'}</h2><pre id="result">${safe(result)}</pre><a href="${prefix}">Start another connection</a>`));return;
    }
    res.writeHead(404);res.end('Not found');
  } catch(error) {
    // Never log request URLs, codes, tokens, client secrets or private responses.
    console.error('Local MCP simulation failed:',error.message);
    res.writeHead(500);res.end(html('<h2>Connection test failed</h2><p>Inspect the simulator assertion in the isolated container log.</p>'));
  }
}).listen(8005,'0.0.0.0');
setInterval(()=>{for(const [key,value] of attempts)if(value.expires<Date.now())attempts.delete(key)},60000).unref();
