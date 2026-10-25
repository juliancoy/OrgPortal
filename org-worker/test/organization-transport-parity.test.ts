import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { app } from '../src/index';
import { handleEventMcp } from '../src/eventMcp';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { identityProfile } from './helpers/identityProfile';

test('REST and MCP share directory receipts, policies, public projection and ownership intent', async t => {
  const db = new TimebankDatabase();
  t.after(() => db.sqlite.close());
  for (const file of ['0002_org_event_directories.sql', '0015_organization_iam.sql', '0017_event_mcp_operations.sql'])
    db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const resource = 'https://portal.transport.test/mcp', issuer = 'https://identity.transport.test';
  const subject = 'owner:00000000-0000-4000-8000-000000000001';
  const env = { DB: db.asD1(), PIDP_BASE_URL: issuer, MCP_PUBLIC_URL: resource, MCP_OAUTH_ISSUER: issuer,
    MCP_OAUTH_JWKS_URL: `${issuer}/keys`, MCP_SUBJECT_MAP_JSON: JSON.stringify({ [subject]: 'operator' }),
    MCP_OAUTH_INTROSPECTION_URL: `${issuer}/oauth/mcp/introspect`, MCP_OAUTH_INTROSPECTION_SECRET: 'synthetic-secret' } as Env;
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const token = await new SignJWT({ scope: 'org:portal.read org:portal.write' }).setProtectedHeader({ alg: 'ES256' })
    .setIssuer(issuer).setSubject(subject).setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const jwk = await exportJWK(publicKey);
  let operator = true;
  t.mock.method(globalThis, 'fetch', async input => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/keys')) return Response.json({ keys: [jwk] });
    if (url.endsWith('/introspect')) return Response.json({ active: true, sub: subject, iss: issuer, aud: resource,
      scope: claims.scope, exp: claims.exp, account_subject: subject, canonical_user_id: 'operator', account_id: 'account', is_sysadmin: operator });
    return Response.json(identityProfile({ id: 'operator', full_name: 'Operator', is_sysadmin: operator }));
  });
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const response = await handleEventMcp(new Request(resource, { method: 'POST', headers: {
      authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: name === 'tools/list' ? name : 'tools/call', params: name === 'tools/list' ? {} : { name, arguments: args } }) }), env);
    assert.equal(response.status, 200);
    return (await response.json() as { result: { tools?: { name: string }[]; isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> } }).result;
  }
  const input = { name: 'Transport Example', description: 'Public evidence', sourceUrl: 'https://company.transport.test/about', website: 'https://company.transport.test/' };
  const list = await rpc('tools/list');
  for (const name of ['preview_directory_registration', 'apply_directory_registration', 'preview_owned_organization_creation', 'apply_owned_organization_creation', 'preview_organization_ownership_release', 'get_organization_operation'])
    assert.ok(list.tools?.some(tool => tool.name === name), name);
  const preview = await rpc('preview_directory_registration', input);
  assert.equal(preview.isError, undefined, preview.content?.[0]?.text);
  const previewId = String(preview.structuredContent!.previewId);
  const rest = await app.request('https://portal.transport.test/api/network/directory/registration/apply', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-session', 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, confirm: true, previewId }),
  }, env);
  assert.equal(rest.status, 200, await rest.clone().text());
  const saved = await rest.json() as { organizationId: string; effects: { createsOwnership: boolean } };
  assert.equal(saved.effects.createsOwnership, false);
  const mcpRead = await rpc('get_directory_organization', { organizationId: saved.organizationId });
  const restRead = await app.request(`https://portal.transport.test/api/network/directory/${saved.organizationId}`, { headers: { authorization: 'Bearer synthetic-session' } }, env);
  assert.deepEqual(await restRead.json(), mcpRead.structuredContent);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organization_ownerships').get()!.n, 0);
  operator = false;
  const denied = await rpc('preview_directory_registration', { ...input, name: 'Another' });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /Operator access/);
  const restDenied = await app.request('https://portal.transport.test/api/network/directory/registration/preview', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-session', 'content-type': 'application/json' }, body: JSON.stringify({ ...input, name: 'Another' }),
  }, env);
  assert.equal(restDenied.status, 403);
  const legacyCreate = await app.request('https://portal.transport.test/api/network/orgs', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-session', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Unintended owner' }),
  }, env);
  assert.equal(legacyCreate.status, 400);
});

test('live superadmin can brand a company through a tenant MCP connection without company membership',async t=>{
 const db=new TimebankDatabase();t.after(()=>db.sqlite.close());
 for(const file of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0043_organization_media.sql','0029_portal_tenant_deployment_model.sql','0032_portal_tenant_org_slug.sql','0033_portal_tenant_custom_domains.sql'])db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 db.sqlite.exec("INSERT INTO organizations(id,name,slug,tags) VALUES('company','Company','company','[]'),('tenant','Tenant','tenant','[]')");
 const resource='https://tenant.test/api/org/mcp',issuer='https://id.operator.test',subject='owner:00000000-0000-4000-8000-000000000002';
 const env={DB:db.asD1(),PUBLIC_PORTAL_BASE_URL:'https://tenant.test',MCP_OAUTH_ISSUER:issuer,MCP_OAUTH_JWKS_URL:issuer+'/keys',MCP_SUBJECT_MAP_JSON:JSON.stringify({[subject]:'operator'}),MCP_OAUTH_INTROSPECTION_URL:issuer+'/oauth/mcp/introspect',MCP_OAUTH_INTROSPECTION_SECRET:'synthetic-secret',MCP_RESOURCE_CONFIG_JSON:JSON.stringify({[resource]:{name:'Tenant',organizationId:'tenant'}})} as Env;
 const {privateKey,publicKey}=await generateKeyPair('ES256'),jwk=await exportJWK(publicKey);
 const token=await new SignJWT({scope:'org:portal.read org:portal.write'}).setProtectedHeader({alg:'ES256'}).setIssuer(issuer).setSubject(subject).setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());let authority=true;
 t.mock.method(globalThis,'fetch',async input=>String(input).endsWith('/keys')?Response.json({keys:[jwk]}):Response.json({active:true,canonical_user_id:'operator',account_id:'account',account_subject:subject,sub:subject,iss:issuer,aud:resource,scope:claims.scope,exp:claims.exp,is_sysadmin:authority}));
 async function rpc(name:string,args:Record<string,unknown>){const response=await handleEventMcp(new Request(resource,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env);assert.equal(response.status,200);return (await response.json() as any).result;}
 const target={organizationId:'company'};
 assert.equal((await rpc('get_organization_profile',target)).structuredContent.organization.id,'company');
 const setup=await rpc('save_portal_setup',{...target,slug:'company',name:'Company',homeKind:'org',homeImageUrl:'https://company.example/cover.webp',brandImageUrl:'https://company.example/icon.webp'});assert.equal(setup.isError,undefined,JSON.stringify(setup));assert.equal(setup.structuredContent.portal.brand_image_path,"https://company.example/icon.webp");assert.equal(setup.structuredContent.portal.home_image_url,"https://company.example/cover.webp");
 const args={...target,palette:[{label:'Company Navy',value:'#1A2B4C'}]};
 const preview=await rpc('preview_portal_branding',args);assert.equal(preview.isError,undefined);
 authority=false;
 for(const name of ['get_organization_profile','get_portal_setup','preview_portal_branding'])assert.equal((await rpc(name,name==='preview_portal_branding'?args:target)).isError,true);
 assert.equal((await rpc('apply_portal_branding',{...args,previewId:preview.structuredContent.previewId})).isError,true);
 authority=true;
 const saved=await rpc('apply_portal_branding',{...args,previewId:preview.structuredContent.previewId});assert.equal(saved.isError,undefined);assert.equal(saved.structuredContent.palette[0].value,'#1A2B4C');
 assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM organization_memberships WHERE organization_id='company'").get()!.n,0);
 assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM group_sites WHERE organization_id='tenant'").get()!.n,0);
});
