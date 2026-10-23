import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { DatabaseSync } from 'node:sqlite';
import { accountCommand } from '../scripts/mcp-account-client.mjs';
import { handleEventMcp } from '../src/eventMcp';

async function fixture(t: any, tenant = false) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE organizations(id TEXT,name TEXT,slug TEXT);
    CREATE TABLE organization_memberships(organization_id TEXT,user_id TEXT,status TEXT,role TEXT);
    INSERT INTO organizations VALUES('life','LifeTech','lifetech'),('other','Other','other'),('outsider','Private','private');
    INSERT INTO organization_memberships VALUES('life','canonical-user','active','owner'),('other','canonical-user','active','member'),('outsider','someone-else','active','owner');`);
  const DB = {prepare(query:string){const statement=sql.prepare(query); const bound=(args:unknown[])=>({bind:(...next:unknown[])=>bound(next),first:async()=>statement.get(...args as any[]),all:async()=>({results:statement.all(...args as any[])})}); return bound([])}} as unknown as D1Database;
  const resource = tenant ? 'https://lifetech.fyi/api/org/mcp' : 'https://orgportal.cc/mcp';
  const env = {DB,MCP_PUBLIC_URL:resource,MCP_OAUTH_ISSUER:'https://identity.account.test',MCP_OAUTH_JWKS_URL:`https://identity.account.test/${crypto.randomUUID()}/jwks`,MCP_SUBJECT_MAP_JSON:'{"signed-subject":"mapped-before-introspection"}',MCP_OAUTH_INTROSPECTION_URL:'https://identity.account.test/oauth/mcp/introspect',MCP_OAUTH_INTROSPECTION_SECRET:'never-return-this-secret',MCP_RESOURCE_CONFIG_JSON:JSON.stringify({[resource]:{name:tenant?'LifeTech':'OrgPortal',...(tenant?{organizationId:'life'}:{})}})} as unknown as Env;
  const {privateKey,publicKey}=await generateKeyPair('ES256');const key=await exportJWK(publicKey);
  let active=true;let email:unknown='julian@codecollective.us',emailVerified:unknown=true;
  t.mock.method(globalThis,'fetch',async (url:RequestInfo,init:RequestInit)=>{
    if(String(url)===resource)return handleEventMcp(new Request(url,init),env);
    if(String(url).endsWith('/jwks'))return Response.json({keys:[key]});
    const token=new URLSearchParams(init.body as string).get('token')!;
    const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
    return Response.json({active,canonical_user_id:'canonical-user',account_id:'member-account',account_subject:payload.sub,...payload,email,email_verified:emailVerified});
  });
  const rpc=async(name:string,scopes='org:portal.read',arguments_={})=>{
    const token=await new SignJWT({scope:scopes,email:'untrusted@example.test',email_verified:true}).setProtectedHeader({alg:'ES256'}).setSubject('signed-subject').setIssuer(env.MCP_OAUTH_ISSUER!).setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const response=await handleEventMcp(new Request(resource,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:name==='tools/list'?'tools/list':'tools/call',params:name==='tools/list'?{}:{name,arguments:arguments_}})}),env);
    return {status:response.status,body:await response.json() as any};
  };
  t.after(()=>sql.close());return {rpc,sql,env,resource,privateKey,setEmail:(value:unknown,verified:unknown)=>{email=value;emailVerified=verified},revoke:()=>{active=false}};
}

test('account discovery advertises schemas and reports canonical identity without credentials',async t=>{
  const f=await fixture(t);
  const tools=(await f.rpc('tools/list')).body.result.tools;
  for(const name of ['get_current_account','get_connection_status','diagnose_connection']){
    const tool=tools.find((tool:any)=>tool.name===name);assert.ok(tool?.outputSchema);assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.destructiveHint,false);
  }
  const current=(await f.rpc('get_current_account')).body.result.structuredContent;
  assert.equal(current.account.email,'julian@codecollective.us');assert.equal(current.account.emailVerified,true);assert.equal(current.account.userId,'canonical-user');assert.equal(current.account.subject,'signed-subject');assert.equal(current.server.version,'1.3.0');
  assert.deepEqual(current.organizations.map((org:any)=>org.id),['life','other']);
  assert.equal(current.accountSwitch.managedBy,'client');assert.equal(current.revocationChecked,true);
  assert.ok(!JSON.stringify(current).includes('never-return-this-secret'));
  assert.ok(!JSON.stringify(current).includes('refresh_token'));
  assert.ok(!JSON.stringify(current).includes('access_token'));
});

test('tenant whoami cannot inspect other organizations or accept another user as input',async t=>{
  const f=await fixture(t,true);
  const result=(await f.rpc('get_current_account')).body.result;
  assert.deepEqual(result.structuredContent.organizations.map((org:any)=>org.id),['life']);
  assert.equal(result.structuredContent.organizationId,'life');
  const invalid=await f.rpc('get_current_account','org:portal.read',{userId:'someone-else'});
  assert.ok(invalid.body.result?.isError || invalid.body.error);
  const denied=(await f.rpc('get_current_account','org:events.read')).body.result;
  assert.equal(denied.isError,true);assert.equal(denied.structuredContent.error.code,'insufficient_scope');assert.ok(denied._meta['mcp/www_authenticate']);
  f.revoke();assert.equal((await f.rpc('get_connection_status')).status,401);
});

test('doctor reports live checks and sanitized database failures',async t=>{
  const f=await fixture(t);
  const good=(await f.rpc('diagnose_connection')).body.result.structuredContent;
  assert.equal(good.ok,true);assert.ok(good.checks.every((check:any)=>check.status==='pass'));
  f.env.DB={prepare(){throw Error('private database settings')}} as unknown as D1Database;
  const failed=(await f.rpc('diagnose_connection')).body.result.structuredContent;
  assert.equal(failed.ok,false);assert.equal(failed.checks.find((check:any)=>check.code==='database').status,'fail');assert.ok(!JSON.stringify(failed).includes('private database settings'));
});

test('CLI and hosted MCP return identical account information over the real SDK transport',async t=>{
 const f=await fixture(t,true);
 const token=await new SignJWT({scope:'org:portal.read'}).setProtectedHeader({alg:'ES256'}).setSubject('signed-subject').setIssuer(f.env.MCP_OAUTH_ISSUER!).setAudience(f.resource).setIssuedAt().setExpirationTime('5m').sign(f.privateKey);
 for(const action of ['whoami','status','doctor']){
  const result=await accountCommand({resource:f.resource,action},{accessToken:async()=>token});
  const connection=action==='doctor'?result.connection:result;
  assert.equal(connection.account.userId,'canonical-user');assert.equal(connection.server.version,'1.3.0');
  if(action==='whoami')assert.deepEqual(result.organizations.map(org=>org.id),['life']);
  if(action==='doctor')assert.equal(result.ok,true);
 }
});

test('email verification remains explicit and token claims cannot fill missing PIdP evidence',async t=>{
 const f=await fixture(t);
 for(const [email,verified,expectedEmail,expectedVerified] of [[undefined,undefined,null,null],['member@example.test',false,'member@example.test',false],['member@example.test','true','member@example.test',null],['forged\nEmail verified: yes',true,null,null]]){
 f.setEmail(email,verified);const current=(await f.rpc('get_current_account')).body.result.structuredContent;assert.equal(current.account.email,expectedEmail);assert.equal(current.account.emailVerified,expectedVerified);assert.equal(current.account.userId,'canonical-user');
 }
});
