import assert from 'node:assert/strict';
import test from 'node:test';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { app } from '../src/index';
import { TimebankDatabase } from './helpers/timebankDatabase';

test('public organization metadata resolves attached group homes, configured slug portals and ordinary profiles', async t => {
  const db = new TimebankDatabase(); t.after(() => db.sqlite.close());
  for (const file of ['0002_org_event_directories.sql', '0009_people_ubi_org_sentiments.sql', '0015_organization_iam.sql', '0029_portal_tenant_deployment_model.sql', '0030_organization_feedback.sql', '0032_portal_tenant_org_slug.sql', '0033_portal_tenant_custom_domains.sql']) {
    db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  db.sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES('life','LifeTech','lifetech'),('partner','Partner','partner'); INSERT INTO group_sites(id,organization_id,slug,hostname,name,tagline,home_org_slug,home_url,custom_domain_hostname,custom_domain_status) VALUES('life-portal','life','lifetech','lifetech.fyi','LifeTech','Health','lifetech','https://lifetech.fyi/portals/lifetech','lifetech.fyi','attached')");
  const env = { DB: db.asD1() } as Env;
  const get = async (slug: string) => app.request(`https://medtech.social/api/network/orgs/public/${slug}`, {}, env);
  let response = await get('lifetech'); assert.equal(response.status, 200);
  let org = await response.json() as { group_home_url: string | null };
  assert.equal(org.group_home_url, 'https://lifetech.fyi/');
  db.sqlite.exec("UPDATE group_sites SET custom_domain_status='requested',home_url='https://codecollective.us/p/portals/lifetech' WHERE id='life-portal'");
  org = await (await get('lifetech')).json(); assert.equal(org.group_home_url, 'https://codecollective.us/p/portals/lifetech');
  for (const unsafe of ['javascript:alert(1)', 'https://user:password@group.example/', 'http://group.example/']) {
    db.sqlite.prepare("UPDATE group_sites SET home_url=? WHERE id='life-portal'").run(unsafe);
    org = await (await get('lifetech')).json(); assert.equal(org.group_home_url, null);
  }
  org = await (await get('partner')).json(); assert.equal(org.group_home_url, null);
  assert.equal((await get('missing')).status, 404);
});
