import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPair, exportJWK, SignJWT} from 'jose';
import {handleEventMcp} from '../src/eventMcp';
import {claimOrganization} from '../src/organizationIam';
import {TimebankDatabase} from './helpers/timebankDatabase';
import {readCurrentSchemaFileSync as readFileSync} from './helpers/currentSchema';

test('MCP transports full-size images without weakening other envelopes or write receipts', async t => {
  const db = new TimebankDatabase();
  t.after(() => db.sqlite.close());
  for (const file of ['0002_org_event_directories.sql','0015_organization_iam.sql','0017_event_mcp_operations.sql','0043_organization_media.sql'])
    db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('org','Transport images','transport-images')");
  await claimOrganization(db.asD1(), 'org', {id:'owner',name:'Owner',email:null,isOperator:false}, new Date().toISOString());
  const resource = 'https://image.transport.test/mcp', issuer = 'https://image.identity.test';
  const {privateKey,publicKey} = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const token = await new SignJWT({scope:'org:portal.read org:portal.write'}).setProtectedHeader({alg:'ES256'})
    .setSubject('subject').setIssuer(issuer).setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  t.mock.method(globalThis, 'fetch', async () => Response.json({keys:[jwk]}));
  let storedBytes = 0;
  const env = {DB:db.asD1(),MCP_PUBLIC_URL:resource,MCP_OAUTH_ISSUER:issuer,MCP_OAUTH_JWKS_URL:issuer+'/keys',
    MCP_SUBJECT_MAP_JSON:JSON.stringify({subject:'owner'}),
    SCAN_IMAGES:{put:async (_key:string, bytes:Uint8Array) => {storedBytes += bytes.length;},delete:async () => {}}} as unknown as Env;
  const headers = {authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'};
  const body = (name:string, args:Record<string,unknown>) => JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
  const send = (payload:string) => handleEventMcp(new Request(resource,{method:'POST',headers,body:payload}),env);
  async function rpc(name:string, args:Record<string,unknown>) {
    const response = await send(body(name,args));
    assert.equal(response.status,200);
    return (await response.json() as any).result;
  }
  // Signature-bearing fixture tests the existing image byte contract, not rendering.
  const bytes = Buffer.alloc(8*1024*1024);
  bytes.set([137,80,78,71,13,10,26,10]);
  const args = {organizationId:'org',dataBase64:bytes.toString('base64'),contentType:'image/png'};
  const preview = await rpc('preview_organization_image_upload',args);
  assert.equal(preview.isError,undefined,JSON.stringify(preview));
  assert.equal(preview.structuredContent.image.size,bytes.length);
  assert.equal(storedBytes,0);
  const missingReceipt = await rpc('apply_organization_image_upload',args);
  assert.equal(missingReceipt.isError,true);
  assert.equal(storedBytes,0);
  const applied = await rpc('apply_organization_image_upload',{...args,previewId:preview.structuredContent.previewId});
  assert.equal(applied.isError,undefined,JSON.stringify(applied));
  assert.equal(storedBytes,bytes.length);
  const tooLarge = await rpc('preview_organization_image_upload',{...args,dataBase64:Buffer.concat([bytes,Buffer.from([0])]).toString('base64')});
  assert.equal(tooLarge.isError,true);
  assert.equal(storedBytes,bytes.length);

  const profile = {organizationId:'org',image_upload:{dataBase64:args.dataBase64,contentType:args.contentType}};
  const profilePreview = await rpc('preview_organization_profile',profile);
  assert.equal(profilePreview.isError,undefined,JSON.stringify(profilePreview));
  const profileApplied = await rpc('apply_organization_profile',{...profile,confirm:true,previewId:profilePreview.structuredContent.previewId});
  assert.equal(profileApplied.isError,undefined,JSON.stringify(profileApplied));
  assert.equal(storedBytes,bytes.length,'existing image is reused');
  for (const dataBase64 of ['AAAA=','AA=A','A===','AA-_','AAAA\nAAA','====']) {
    const invalid = await rpc('preview_organization_image_upload',{...args,dataBase64});
    assert.equal(invalid.isError,true,dataBase64);
  }
  assert.equal(storedBytes,bytes.length);

  // Size is measured in received UTF-8 bytes, including JSON, not characters or headers.
  const sizedBody = (name:string, size:number) => {
    const empty = body(name,{padding:''});
    return body(name,{padding:'x'.repeat(size-Buffer.byteLength(empty))});
  };
  for (const [name,limit] of [['get_event',64*1024],['preview_email_history_import',1024*1024],['preview_organization_image_upload',12*1024*1024]] as const) {
    assert.equal((await send(sizedBody(name,limit))).status,200,name);
    assert.equal((await send(sizedBody(name,limit+1))).status,413,name);
  }
  assert.equal((await send(body('get_event',{padding:'é'.repeat(40000)}))).status,413);
  assert.equal((await send('{bad JSON')).status,400);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(64*1024));},cancel(){cancelled=true;}});
  const request = new Request(resource,{method:'POST',headers:{...headers,'content-length':'1'},body:stream,duplex:'half'} as RequestInit);
  assert.equal((await handleEventMcp(request,env)).status,413);
  assert.equal(cancelled,true,'oversized chunked bodies are cancelled despite a false Content-Length');
});
