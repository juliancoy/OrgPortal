import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, run } from '../scripts/orgportal.mjs';

test('CLI selects portal-bound account connections and rejects malformed targets', () => {
  const command = parseCommand(['auth', 'login', '--portal', 'https://medtech.social', '--connection', 'work', '--no-browser'], {});
  assert.equal(command.resource, 'https://medtech.social/api/org/mcp');
  assert.equal(command.connection, 'work');
  assert.equal(command.openBrowser, false);
  assert.equal(parseCommand(['auth', 'login'], {}).openBrowser, false);
  assert.equal(parseCommand(['auth', 'login', '--browser'], {}).openBrowser, true);
  assert.equal(parseCommand(['auth', 'logout'], {}).resource, 'https://lifetech.fyi/api/org/mcp');
  for (const args of [['auth', 'delete'], ['auth', 'login', '--portal', 'http://example.com'],
    ['auth', 'login', '--issuer', 'https://example.com/path'], ['auth', 'login', '--resource', 'https://user:secret@example.com/mcp'],
    ['auth', 'logout', '--connection', '../other']]) assert.throws(() => parseCommand(args, {}));
});

test('login verifies access; logout revokes; both release keyring locks', async () => {
  for (const action of ['login', 'logout']) {
    const calls: string[] = [];
    await run(['auth', action, '--connection', 'work'], { env: {}, log: () => {},
      credentialStore: async (_resource, _issuer, name) => {
        assert.equal(name, 'work');
        return { load: async () => ({ refreshToken: 'test-only' }), release: async () => { calls.push('release'); } };
      },
      browserLogin: async (_resource, _issuer, _client, _open, options) => {
        assert.equal(options.disconnect, action === 'logout');
        assert.match(options.scope, /org:portal.write/);
        return { accessToken: async () => { calls.push('verify'); }, disconnect: async () => { calls.push('revoke'); }, close: async () => { calls.push('close'); } };
      },
    });
    assert.deepEqual(calls, [action === 'login' ? 'verify' : 'revoke', 'close', 'release']);
  }
});

test('logout without a saved grant is offline and idempotent', async () => {
  let released = false;
  await run(['auth', 'logout'], { env: {}, log: () => {},
    credentialStore: async () => ({ load: async () => ({ clientId: 'registered' }), release: async () => { released = true; } }),
    browserLogin: async () => { assert.fail('Must not start authorization'); },
  });
  assert.equal(released, true);
});

test('failed revocation reports failure and still releases the keyring lock', async () => {
  let released = false;
  await assert.rejects(run(['auth', 'logout'], { env: {}, log: () => {},
    credentialStore: async () => ({ load: async () => ({ refreshToken: 'test-only' }), release: async () => { released = true; } }),
    browserLogin: async () => ({ disconnect: async () => { throw Error('Revocation unavailable'); }, close: async () => {} }),
  }), /Revocation unavailable/);
  assert.equal(released, true);
});
test('journal mirror uses infrastructure credentials without starting PIdP account login', async () => {
  let mirrored = false;
  await run(['journal', 'sync', '--file', '/tmp/operator-journal.sqlite'], { env: {}, log: () => {},
    credentialStore: async () => { assert.fail('Journal operator command must not use account credentials'); },
    mirrorChangeJournal: async file => { assert.equal(file, '/tmp/operator-journal.sqlite'); mirrored = true; return { entries: 0 }; },
  });
  assert.equal(mirrored, true);
  assert.throws(() => parseCommand(['journal', 'sync', '--portal', 'https://medtech.social'], {}), /operator credentials/);
});

test('profile CLI requires explicit organization, patch and receipt; uses saved account and releases connection', async () => {
  assert.equal(parseCommand(['profile','get','--organization','org'],{}).profileAction,'get');
  for(const args of [['profile','get'],['profile','preview','--organization','org'],['profile','apply','--organization','org','--file','patch.json'],['profile','apply','--organization','org','--file','patch.json','--preview-id','receipt','--dry-run']]) assert.throws(()=>parseCommand(args,{}));
  let released=false,closed=false,called=false;
  await run(['profile','apply','--organization','org','--file','patch.json','--preview-id','receipt'],{
    env:{},log:()=>{},credentialStore:async()=>({load:async()=>({refreshToken:'test-only'}),release:async()=>{released=true}}),
    browserLogin:async()=>({close:async()=>{closed=true}}),
    runProfileCommand:async command=>{called=true;assert.equal(command.profileAction,'apply');assert.equal(command.organizationId,'org');assert.equal(command.previewId,'receipt');return {saved:true}},
  });
  assert.ok(released&&closed&&called);
  await assert.rejects(run(['profile','get','--organization','org'],{env:{},log:()=>{},credentialStore:async()=>({load:async()=>null,release:async()=>{}}),browserLogin:async()=>assert.fail('No automatic login')}),/Sign in first/);
});

test('profile CLI transports reviewed patches and receipts over authenticated MCP', async () => {
  const { runProfileCommand } = await import('../scripts/orgportal.mjs');
  const { createServer } = await import('node:http');
  const { mkdtemp,writeFile,rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory=await mkdtemp(join(tmpdir(),'profile-cli-fixture-'));
  let call:any;
  const server=createServer(async(req,res)=>{
    if(req.method!=='POST'){res.writeHead(405).end();return}
    assert.equal(req.headers.authorization,'Bearer synthetic-fixture-token');
    let body='';for await(const chunk of req)body+=chunk;
    const message=JSON.parse(body);
    if(message.method==='notifications/initialized'){res.writeHead(202).end();return}
    res.setHeader('content-type','application/json');
    const result=message.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:{content:[{type:'text',text:'saved'}],structuredContent:{saved:true}};
    if(message.method==='tools/call')call=message.params;
    res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const file=join(directory,'patch.json');await writeFile(file,JSON.stringify({description:'Researched description',image_url:null}));
    const address=server.address() as {port:number};
    const result=await runProfileCommand({resource:`http://127.0.0.1:${address.port}/mcp`,profileAction:'apply',organizationId:'org',profileFile:file,previewId:'receipt'},{accessToken:async()=> 'synthetic-fixture-token'});
    assert.deepEqual(result,{saved:true});assert.deepEqual(call,{name:'apply_organization_profile',arguments:{description:'Researched description',image_url:null,organizationId:'org',previewId:'receipt',confirm:true}});
    await writeFile(file,JSON.stringify({organizationId:'other'}));
    await assert.rejects(runProfileCommand({profileAction:'apply',profileFile:file},{}),/only organization profile fields/);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(directory,{recursive:true,force:true});}
});

test('explicit admin login requires a separate named connection and primary-account portal scopes', async()=>{
 assert.throws(()=>parseCommand(['auth','login','--admin'],{}),/explicit --connection/);
 assert.throws(()=>parseCommand(['profile','get','--organization','org','--admin'],{}),/auth login/);
 const claims={sub:'owner:admin',scope:'org:portal.read org:portal.write'};
 const token=`fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
 await run(['auth','login','--admin','--portal','https://orgportal.cc','--connection','admin'],{env:{},log:()=>{},credentialStore:async()=>({load:async()=>null,release:async()=>{}}),browserLogin:async(_r,_i,_c,_b,options)=>{assert.equal(options.admin,true);return{accessToken:async()=>token,close:async()=>{}}}});
});
