import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { organizationBrandingRoutes } from '../src/organizationBranding';
test('org branding is public, resolves different portal slugs, and excludes operational configuration',async()=>{
 const db=new EventTestDb();
 try{
  await db.prepare(`INSERT INTO group_sites(id,organization_id,slug,hostname,name,tagline,features,brand_image_path,feature_config,custom_domain_notes)
   VALUES('site','org-one','different-portal-slug','one.slug.portal.local','One','Community','["events"]','/one.png',?, 'private provisioning notes')`).bind(JSON.stringify({brandPalette:[{label:'Gold',value:'#d4af37'}],privateSetting:'not-public'})).run();
  const app=organizationBrandingRoutes();
  const response=await app.request('https://example.test/one/branding',{}, {DB:db as unknown as D1Database} as Env);
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json() as {portal:{slug:string;brand_image_path:string;features:string[];feature_config:unknown}};
  assert.equal(data.portal.slug,'different-portal-slug');assert.equal(data.portal.brand_image_path,'/one.png');assert.deepEqual(data.portal.features,['events']);
  assert.deepEqual(data.portal.feature_config,{brandThemes:null,brandPalette:[{label:'Gold',value:'#d4af37'}]});
  for(const [banner,expected] of [['https://company.example/namebanner.webp','https://company.example/namebanner.webp'],['javascript:alert(1)',undefined],['https://user:password@company.example/logo.png',undefined]]){
   await db.prepare("UPDATE group_sites SET feature_config=json_set(feature_config,'$.nameBannerUrl',?) WHERE id='site'").bind(banner).run();
   const guide=await(await app.request('https://example.test/one/branding',{}, {DB:db as unknown as D1Database} as Env)).json() as {portal:{feature_config:{nameBannerUrl?:string}}};
   assert.equal(guide.portal.feature_config.nameBannerUrl,expected);assert.doesNotMatch(JSON.stringify(guide),/privateSetting|private provisioning|custom_domain_notes/);
  }
  const themes={defaultTheme:'ocean',themes:[{id:'ocean',name:'Ocean',light:{primary:'#123456'},dark:{primary:'#ABCDEF'}}]};
  await db.prepare("UPDATE group_sites SET feature_config=json_set(feature_config,'$.brandThemes',json(?)) WHERE id='site'").bind(JSON.stringify(themes)).run();
  const themed=await(await app.request('https://example.test/one/branding',{}, {DB:db as unknown as D1Database} as Env)).json() as {portal:{feature_config:{brandThemes:unknown}}};
  assert.deepEqual(themed.portal.feature_config.brandThemes,themes);
  await db.prepare("UPDATE group_sites SET home_heading='Welcome to One',home_description='Public welcome copy',home_primary_label='Events',home_primary_href='/portals/different-portal-slug',home_url='https://orgportal.cc/portals/different-portal-slug' WHERE id='site'").run();
  const home=await(await app.request('https://example.test/one/branding',{}, {DB:db as unknown as D1Database} as Env)).json() as {portal:{home_heading:string;home_description:string;home_primary_href:string;home_url:string}};
  assert.equal(home.portal.home_heading,'Welcome to One');assert.equal(home.portal.home_description,'Public welcome copy');assert.equal(home.portal.home_primary_href,'/orgs/one');assert.equal(home.portal.home_url,'https://orgportal.cc/orgs/one');
  assert.doesNotMatch(JSON.stringify(home),/\/portals\//);
  assert.doesNotMatch(JSON.stringify(data),/privateSetting|private provisioning|custom_domain_notes/);
  await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('empty','Empty','empty')").run();
  assert.deepEqual(await(await app.request('https://example.test/empty/branding',{}, {DB:db as unknown as D1Database} as Env)).json(),{portal:null});
  assert.equal((await app.request('https://example.test/missing/branding',{}, {DB:db as unknown as D1Database} as Env)).status,404);
 }finally{db.close()}
});
test('explicit organization binding wins; another organization’s portal is never used as a legacy fallback',async()=>{
 const db=new EventTestDb();
 try{
  await db.prepare("INSERT INTO organizations(id,name,slug) VALUES('other','Other','other')").run();
  await db.prepare(`INSERT INTO group_sites(id,organization_id,slug,hostname,name,tagline,home_org_slug)
   VALUES('wrong','other','other-portal','other.slug.portal.local','Other','Other community','one')`).run();
  const app=organizationBrandingRoutes(),env={DB:db as unknown as D1Database} as Env;
  assert.deepEqual(await(await app.request('https://example.test/one/branding',{},env)).json(),{portal:null});
  await db.prepare(`INSERT INTO group_sites(id,slug,hostname,name,tagline,home_org_slug)
   VALUES('legacy','legacy-portal','legacy.slug.portal.local','One','Legacy community','one')`).run();
  assert.equal((await(await app.request('https://example.test/one/branding',{},env)).json() as {portal:{id:string}}).portal.id,'legacy');
  await db.prepare(`INSERT INTO group_sites(id,organization_id,slug,hostname,name,tagline,home_org_slug)
   VALUES('correct','org-one','correct-portal','correct.slug.portal.local','One','Current community','one')`).run();
  assert.equal((await(await app.request('https://example.test/one/branding',{},env)).json() as {portal:{id:string}}).portal.id,'correct');
 }finally{db.close()}
});
