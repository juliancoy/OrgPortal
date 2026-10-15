import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
import {identityRequest,researchAccess,isResearchPage} from './identity.js';

test('central identity uses its original origin and strips spoofed forwarding headers',async()=>{
 const response=await identityRequest(new Request('https://orgportal.cc/pidp/app/login?app=orgportal',{headers:{'x-forwarded-host':'evil.test','x-forwarded-prefix':'/evil'}}),{
  PIDP:{fetch:async(url,init)=>{
   assert.equal(url,'https://orgportal.cc/app/login?app=orgportal');
   assert.equal(init.headers.get('x-forwarded-host'),null);
   assert.equal(init.headers.get('x-forwarded-prefix'),'/pidp');
   return new Response('login',{headers:{'set-cookie':'pidp_session=fixture; Domain=codecollective.us; Path=/; HttpOnly; Secure'}});
  }},
 },'/app/login');
 assert.doesNotMatch(response.headers.get('set-cookie'),/Domain=/i);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('all research routes and internal shell paths deny guests before reading assets',async()=>{
 for(const host of ['orgportal.cc','lifetech.fyi','medtech.social']) for(const path of ['/ecosystem/network','/ecosystem/network/3d','/ecosystem/network/4d','/ecosystem/network/relationships','/__portal_root/ecosystem/network/overview']) {
  const response=await worker.fetch(new Request(`https://${host}${path}?org=tedco`),{ORGPORTAL_SITE_HOSTS:host,ASSETS:{fetch(){throw Error('Guest must not read the shell')}}});
  assert.equal(response.status,303);
  const destination=new URL(response.headers.get('location'));
  assert.equal(destination.origin,`https://${host}`);
  assert.equal(destination.pathname,'/users/login');
  assert.equal(destination.searchParams.get('next'),path.replace('/__portal_root','')+'?org=tedco');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
 assert.equal(isResearchPage('/ecosystem-data/ecosystem-portal.json'),false);
});
test('research access validates sessions, rejects forged cookies and fails closed on outages',async()=>{
 for(const [status,expected] of [[200,null],[401,303],[403,303],[503,503]]) {
  const result=await researchAccess(new Request('https://orgportal.cc/ecosystem/network/3d',{headers:{cookie:'pidp_session=fixture'}}),{PIDP:{fetch:async(url,init)=>{
   assert.equal(url,'https://orgportal.cc/auth/session');
   assert.equal(init.headers.get('cookie'),'pidp_session=fixture');
   return Response.json({authenticated:status===200},{status});
  }}});
  assert.equal(result?.status ?? null,expected);
 }
});
