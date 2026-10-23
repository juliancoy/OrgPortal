import test from 'node:test';
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
