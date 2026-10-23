import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import worker from './worker.js';
import {isPortalPagePath} from '../web/portalRoutes.mjs';

test('retired organization portal URLs return 404 without fetching data or redirecting',async()=>{
 for(const path of ['/portals/lifetech','/portals/lifetech/branding','/p/portals/lifetech','/portals/unknown/nested']){
  assert.equal(isPortalPagePath(path),false);
  for(const method of ['GET','HEAD']){
   const response=await worker.fetch(new Request('https://orgportal.cc'+path+'?tab=branding',{method}),{});
   assert.equal(response.status,404);assert.equal(response.headers.get('Location'),null);
  }
 }
 assert.equal(isPortalPagePath('/orgs/lifetech'),true);
});

test('install manifests launch recognized pages rather than retired organization URLs',()=>{
 const directory=new URL('../web/public/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>name.endsWith('.webmanifest'))) {
  const manifest=JSON.parse(readFileSync(new URL(name,directory),'utf8'));
  const start=new URL(manifest.start_url,'https://orgportal.cc/');
  assert.equal(isPortalPagePath(start.pathname),true,`${name}: ${start.pathname}`);
  assert.doesNotMatch(manifest.id||'',/\/portals(?:\/|$)/);
 }
});
