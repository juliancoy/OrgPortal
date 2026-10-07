import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { app } from '../src/index';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { publicCommunity } from '../src/portalCommunities';

const migration = readFileSync(new URL('../migrations/0074_orgportal_platform.sql', import.meta.url), 'utf8');
function fixture() {
  const db = new TimebankDatabase();
  for (const file of ['0002_org_event_directories.sql', '0029_portal_tenant_deployment_model.sql', '0032_portal_tenant_org_slug.sql', '0033_portal_tenant_custom_domains.sql']) {
    db.sqlite.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  }
  db.sqlite.exec("UPDATE portal_tenants SET custom_domain_hostname='orgportal.cc',custom_domain_status='attached' WHERE id='code-collective'");
  return db;
}

test('platform migration separates OrgPortal without changing community identity or balances', async t => {
  const db = fixture(); t.after(() => db.sqlite.close());
  const communities = db.sqlite.prepare('SELECT * FROM timebank_communities ORDER BY id').all();
  const organizations = db.sqlite.prepare('SELECT * FROM organizations ORDER BY id').all();
  db.sqlite.exec(migration);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM timebank_communities ORDER BY id').all(), communities);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM organizations ORDER BY id').all(), organizations);
  const env = { DB: db.asD1() };
  const platformResponse = await app.request('https://orgportal.cc/api/portal/tenant', {}, env);
  assert.equal(platformResponse.status, 200);
  const platform = await platformResponse.json() as { id: string; features: string[]; public_base_url: string };
  assert.equal(platform.id, 'orgportal');
  assert.equal(platform.public_base_url, 'https://orgportal.cc');
  assert.equal(platform.features.includes('timebank'), false);
  assert.equal((await app.request('https://orgportal.cc/api/timebank/community', {}, env)).status, 404);
  assert.equal((await app.request('https://codecollective.us/api/timebank/community', {}, env)).status, 200);
  const old = await app.request('https://codecollective.us/api/portal/tenant', {}, env);
  assert.equal((await old.json() as { id: string }).id, 'code-collective');
  db.sqlite.exec("UPDATE portal_tenants SET tagline='Operator edited tagline' WHERE id='orgportal'");
  db.sqlite.exec(migration);
  assert.equal(db.sqlite.prepare("SELECT tagline FROM portal_tenants WHERE id='orgportal'").get()!.tagline, 'Operator edited tagline');
});

test('community directory publishes safe destinations and omits platform and private tenant configuration', async t => {
  const db = fixture(); t.after(() => db.sqlite.close()); db.sqlite.exec(migration);
  const response = await app.request('https://orgportal.cc/api/portal/communities', {}, { DB: db.asD1() });
  assert.equal(response.status, 200);
  const rows = await response.json() as { id: string; url: string }[];
  assert.equal(rows.some(row => row.id === 'orgportal'), false);
  assert.equal(rows.find(row => row.id === 'code-collective')?.url, 'https://codecollective.us/p');
  assert.equal(rows.some(row => 'custom_domain_notes' in row || 'feature_config' in row), false);
  const base = { id: 'test', name: 'Test', tagline: '', hostname: 'internal.slug.portal.local', profile: 'community', features: '["events"]', slug: 'test', public_base_url: 'https://orgportal.cc/portals/test', custom_domain_hostname: 'test.example', custom_domain_status: 'requested' };
  assert.equal(publicCommunity({ ...base, brand_image_path: '/images/logo.svg', accent_color: '#12325b' })?.logoUrl, 'https://orgportal.cc/images/logo.svg');
  assert.equal(publicCommunity({ ...base, brand_image_path: 'https://lifetech.fyi/logo.png', accent_color: '#12325b' })?.accentColor, '#12325b');
  assert.equal(publicCommunity({ ...base, features: '["timebank"]' })?.logoUrl, 'https://orgportal.cc/images/timebank/timebank-mark.svg');
  for (const image of ['javascript:alert(1)', 'data:image/svg+xml,test', 'https://user:pass@example.com/logo', 'https://test.local/logo']) {
    assert.equal(publicCommunity({ ...base, brand_image_path: image, accent_color: 'red;display:none' })?.logoUrl, null);
    assert.equal(publicCommunity({ ...base, accent_color: 'red;display:none' })?.accentColor, null);
  }
  assert.equal(publicCommunity(base)?.url, 'https://orgportal.cc/portals/test');
  assert.equal(publicCommunity({ ...base, custom_domain_status: 'attached' })?.url, 'https://test.example/');
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'https://localhost', 'https://test.slug.portal.local']) {
    assert.equal(publicCommunity({ ...base, public_base_url: url }), null);
  }
});
