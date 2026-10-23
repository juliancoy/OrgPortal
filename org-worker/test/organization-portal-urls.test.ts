import test from 'node:test';
import assert from 'node:assert/strict';
import {EventTestDb} from './event-test-db';
import {organizationPortalLinks} from '../src/organizationPortalUrls';
import {canonicalOrganizationHref} from '../../shared/organizationUrls';

test('portal metadata links to the bound organization, including different and renamed slugs',async()=>{
 const db=new EventTestDb();
 try{
  const site={organization_id:'org-one',home_org_slug:'outdated',home_url:'https://orgportal.cc/portals/other-alias',public_base_url:'https://codecollective.us/p/portals/other-alias',feature_config:JSON.stringify({privateSetting:'preserved',slugPortal:{enabled:true,path:'/portals/other-alias'}})};
  let links=await organizationPortalLinks(db as unknown as D1Database,site,'https://orgportal.cc');
  assert.equal(links.home_org_slug,'one');assert.equal(links.slug_url,'https://orgportal.cc/orgs/one');assert.equal(links.home_url,'https://orgportal.cc/orgs/one');
  assert.equal(links.public_base_url,'https://codecollective.us/p/orgs/one');
  assert.deepEqual(JSON.parse(String(links.feature_config)),{privateSetting:'preserved',slugPortal:{enabled:true,path:'/orgs/one'}});
  assert.doesNotMatch(JSON.stringify(links),/\/portals\//);
  await db.prepare("UPDATE organizations SET slug='renamed' WHERE id='org-one'").run();
  links=await organizationPortalLinks(db as unknown as D1Database,site,'https://orgportal.cc');assert.equal(links.slug_url,'https://orgportal.cc/orgs/renamed');
  assert.equal((await organizationPortalLinks(db as unknown as D1Database,{...site,organization_id:'missing',home_org_slug:'renamed'},'https://orgportal.cc')).slug_url,null);
  assert.equal((await organizationPortalLinks(db as unknown as D1Database,{...site,organization_id:null,home_org_slug:'renamed'},'https://orgportal.cc')).slug_url,'https://orgportal.cc/orgs/renamed');
 }finally{db.close()}
});
test('normalization never emits retired routes and preserves unrelated destinations and fragments',()=>{
 assert.equal(canonicalOrganizationHref('/portals/alias?ref=test#team','one'),'/orgs/one?ref=test#team');
 assert.equal(canonicalOrganizationHref('/portals/alias/branding?ref=test','one'),'/orgs/one?ref=test&tab=branding');
 assert.equal(canonicalOrganizationHref('https://group.example/about','one'),'https://group.example/about');
 assert.equal(canonicalOrganizationHref('/portals/unlinked',null),null);
 assert.equal(canonicalOrganizationHref('/portals/alias/unrecognized','one'),null);
});
