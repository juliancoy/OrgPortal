import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0069_deism_tenant.sql', import.meta.url), 'utf8');
function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0002_org_event_directories.sql', '0025_portal_tenants.sql', '0027_portal_tenant_branding.sql', '0028_portal_tenant_home_page.sql', '0029_portal_tenant_deployment_model.sql', '0032_portal_tenant_org_slug.sql', '0033_portal_tenant_custom_domains.sql']) {
    db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  }
  return db;
}

test('Deism seed links its organization, publishes the slug portal, and leaves domain attachment pending', () => {
  const db = fixture();
  try {
    db.exec(migration);
    const row = db.prepare("SELECT * FROM portal_tenants WHERE id = 'deism'").get()!;
    assert.equal(row.organization_id, 'deism');
    assert.equal(row.profile, 'deism');
    assert.equal(row.slug, 'deism');
    assert.equal(row.hostname, 'deism.slug.portal.local');
    assert.equal(row.public_base_url, 'https://codecollective.us/p/portals/deism');
    assert.equal(row.canonical_path_prefix, '/p');
    assert.equal(row.custom_domain_hostname, 'portal.deism.church');
    assert.equal(row.custom_domain_status, 'requested');
    assert.deepEqual(JSON.parse(String(row.features)), ['directory', 'events', 'calendar', 'chat']);
    const config = JSON.parse(String(row.feature_config));
    assert.equal(config.orgEvents.enabled, true);
    assert.equal(config.specialtyResources.length, 2);
    assert.ok(config.specialtyResources.every((resource: {external: boolean; href: string}) => resource.external && resource.href.startsWith('https://deism.church/')));
    db.exec("UPDATE portal_tenants SET home_heading='Community edited heading' WHERE id='deism'");
    db.exec(migration);
    assert.equal(db.prepare("SELECT home_heading FROM portal_tenants WHERE id='deism'").get()!.home_heading, 'Community edited heading');
  } finally { db.close(); }
});

test('Deism seed reuses an existing organization without changing its public profile', () => {
  const db = fixture();
  try {
    db.exec("INSERT INTO organizations(id,name,slug) VALUES('existing-deism','Existing Deist organization','deism')");
    db.exec(migration);
    assert.equal(db.prepare("SELECT organization_id FROM portal_tenants WHERE id='deism'").get()!.organization_id, 'existing-deism');
    assert.equal(db.prepare("SELECT name FROM organizations WHERE slug='deism'").get()!.name, 'Existing Deist organization');
  } finally { db.close(); }
});
