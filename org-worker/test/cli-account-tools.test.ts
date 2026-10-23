import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,stat,chmod,symlink,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectionSettings } from '../scripts/connection-settings.mjs';
import { parseCommand,run } from '../scripts/orgportal.mjs';
import { discoveryChecks } from '../scripts/mcp-account-client.mjs';
const resource='https://lifetech.fyi/api/org/mcp',issuer='https://orgportal.cc';
async function settings(t){const directory=await mkdtemp(join(tmpdir(),'orgportal-connections-'));t.after(()=>rm(directory,{recursive:true,force:true}));return {directory,settings:connectionSettings(directory)}}
const current={authenticated:true,account:{subject:'website:registered:member'},scopes:['org:portal.read'],expiresAt:'2030-01-01T00:00:00.000Z',resource,issuer,server:{name:'OrgPortal',version:'1.3.0'},organizations:[{name:'LifeTech',role:'owner'}],organizationsTruncated:false};

test('settings isolate resources and issuers, serialize updates, and store no credentials',async t=>{
 const {directory,settings:s}=await settings(t);
 await Promise.all([s.remember(resource,issuer,'personal'),s.remember(resource,issuer,'work')]);
 await s.select(resource,issuer,'work');assert.equal(await s.active(resource,issuer),'work');
 assert.equal(await s.active('https://medtech.social/api/org/mcp',issuer),'default');
 assert.equal(await s.active(resource,'https://other-issuer.example'),'default');
 assert.deepEqual(await s.list(resource,issuer),['personal','work']);
 const serialized=JSON.parse(await readFile(join(directory,'connections.json'),'utf8'));
 assert.ok(serialized.connections.every(entry=>Object.keys(entry).sort().join(',')==='issuer,name,resource'));
 assert.equal((await stat(join(directory,'connections.json'))).mode & 0o077,0);
 await assert.rejects(s.select(resource,issuer,'unknown'),/Sign in/);
 await s.remove(resource,issuer,'work');assert.equal(await s.active(resource,issuer),'default');assert.deepEqual(await s.list(resource,issuer),['personal']);
});

test('settings reject unsafe names, readable files and symlinks without echoing contents',async t=>{
 const {directory,settings:s}=await settings(t);
 await assert.rejects(s.remember(resource,issuer,'../unsafe'),/Invalid/);
 await s.remember(resource,issuer,'work');const path=join(directory,'connections.json');
 await chmod(path,0o644);await assert.rejects(s.list(resource,issuer),/private/);await chmod(path,0o600);
 await writeFile(path,'sensitive-not-json',{mode:0o600});await assert.rejects(s.list(resource,issuer),error=>!error.message.includes('sensitive-not-json'));
 await rm(path);const other=join(directory,'other');await writeFile(other,'{}');await symlink(other,path);await assert.rejects(s.list(resource,issuer),/regular file/);
});

test('switch verifies the selected saved account and all subsequent commands honor it',async t=>{
 const {settings:s}=await settings(t);const output=[];const released=[];
 const deps={env:{},connectionSettings:s,log:value=>output.push(value),credentialStore:async(_resource,_issuer,name)=>({load:async()=>({clientId:'private-client',refreshToken:'never-print-this-token'}),release:async()=>released.push(name)}),browserLogin:async()=>({close:async()=>{}}),accountCommand:async(command,_account,action)=>{assert.equal(command.connection,'work');assert.equal(action,'whoami');return current}};
 await run(['auth','switch','work','--json'],deps);
 assert.equal(await s.active(resource,issuer),'work');
 await run(['whoami','--json'],deps);
 assert.ok(output.every(value=>JSON.parse(value).connectionName==='work'));
 assert.ok(!output.join('').includes('never-print-this-token'));assert.deepEqual(released,['work','work']);
 await assert.rejects(run(['auth','switch','personal'],{...deps,accountCommand:async()=>{throw Error('not authorized')}}),/not authorized/);
 assert.equal(await s.active(resource,issuer),'work');
});

test('list and cached status never authenticate; explicit connection overrides selection',async t=>{
 const {settings:s}=await settings(t);await s.remember(resource,issuer,'work');await s.select(resource,issuer,'work');
 const output=[];const deps={env:{},connectionSettings:s,log:value=>output.push(JSON.parse(value)),credentialStore:async(_resource,_issuer,name)=>({load:async()=>name==='personal'?{refreshToken:'private',pending:true}:null,release:async()=>{}}),browserLogin:async()=>assert.fail('Cached commands must not authenticate')};
 await run(['auth','status','--connection','personal','--json'],deps);assert.equal(output[0].connection,'personal');assert.equal(output[0].needsReconnect,true);assert.equal(output[0].liveChecked,false);
 await run(['auth','list','--json'],deps);assert.ok(output[1].connections.some(entry=>entry.name==='work'&&entry.selected));
 assert.equal(await s.active(resource,issuer),'work');
});

test('doctor reports discovery, missing grants and keyring failures without opening login',async t=>{
 const {settings:s}=await settings(t);const output=[];
 const base={env:{},connectionSettings:s,log:value=>output.push(JSON.parse(value)),discoveryChecks:async()=>[{code:'discovery',status:'pass',message:'Service found.'}],browserLogin:async()=>assert.fail('Doctor must not sign in')};
 const absent=await run(['doctor','--json'],{...base,credentialStore:async()=>({load:async()=>null,release:async()=>{}})});
 assert.equal(absent.ok,false);assert.equal(output[0].checks.at(-1).code,'account');
 const locked=await run(['doctor','--json'],{...base,credentialStore:async()=>{throw Error('secret keyring internals')}});
 assert.equal(locked.ok,false);assert.equal(output[1].checks.at(-1).code,'credential_storage');assert.equal(output[1].resource,resource);assert.equal(output[1].issuer,issuer);assert.equal(output[1].connectionName,'default');assert.ok(!JSON.stringify(output).includes('secret keyring internals'));
});

test('discovery rejects resource and issuer mismatches and masks remote errors',async()=>{
 const command={resource,issuer};
 const checks=await discoveryChecks(command,async url=>String(url).includes('oauth-protected-resource')?Response.json({resource:'https://other.example/mcp',authorization_servers:[issuer]}):Response.json({issuer,code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']}));
 assert.deepEqual(checks.map(check=>check.status),['fail','pass']);
 const failed=await discoveryChecks(command,async()=>{throw Error('private-remote-response')});assert.ok(!JSON.stringify(failed).includes('private-remote-response'));
});

test('account commands validate flags and cannot implicitly start account authorization',async t=>{
 for(const args of [['auth','switch','../bad'],['auth','switch','work','--connection','personal'],['whoami','--live'],['sync','--json']])assert.throws(()=>parseCommand(args,{}));
 const {settings:s}=await settings(t);
 await assert.rejects(run(['whoami'],{env:{},connectionSettings:s,credentialStore:async()=>({load:async()=>null,release:async()=>{}}),browserLogin:async()=>assert.fail('No automatic browser login')}),/Sign in first/);
});

test('live status and doctor share the selected account and distinguish live results',async t=>{
 const {settings:s}=await settings(t);await s.remember(resource,issuer,'work');await s.select(resource,issuer,'work');
 const output=[];let closed=0,released=0;
 const deps={env:{},connectionSettings:s,log:value=>output.push(JSON.parse(value)),credentialStore:async()=>({load:async()=>({refreshToken:'private'}),release:async()=>{released++}}),browserLogin:async()=>({close:async()=>{closed++}}),discoveryChecks:async()=>[{code:'resource_discovery',status:'pass',message:'Found'}],accountCommand:async(command,_account,action)=>{assert.equal(command.connection,'work');return action==='doctor'?{ok:true,checks:[{code:'authentication',status:'pass',message:'Verified'}],connection:current}:current}};
 await run(['auth','status','--live','--json'],deps);assert.equal(output[0].liveChecked,true);assert.equal(output[0].connectionName,'work');assert.equal(output[0].account.subject,current.account.subject);
 const result=await run(['doctor','--json'],deps);assert.equal(result.ok,true);assert.equal(result.checks.length,2);assert.equal(result.connectionName,'work');assert.equal(closed,2);assert.equal(released,2);
});

 test('explicit login requests reauthorization and human output identifies email without inferring it',async t=>{
 const {settings:s}=await settings(t);const output=[];let reauthorize;
 const deps={env:{},connectionSettings:s,log:v=>output.push(v),credentialStore:async()=>({load:async()=>({clientId:'client',refreshToken:'old'}),release:async()=>{}}),browserLogin:async(_r,_i,_c,_b,options)=>{reauthorize=options.reauthorize;return{accessToken:async()=>'token',close:async()=>{}}},accountCommand:async()=>({...current,account:{...current.account,email:'julian@codecollective.us',emailVerified:true}})};
 await run(['auth','login','--connection','work'],deps);assert.equal(reauthorize,true);
 await run(['whoami','--connection','work'],deps);assert.equal(reauthorize,false);assert.match(output.at(-1),/Email: julian@codecollective.us\nEmail verified: yes/);
 deps.accountCommand=async()=>current;await run(['whoami','--connection','work'],deps);assert.match(output.at(-1),/Email: not supplied by PIdP\nEmail verified: unknown/);
 });
