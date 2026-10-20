import assert from 'node:assert/strict';
import test from 'node:test';
import { readCurrentSchemaFileSync as readFileSync } from './helpers/currentSchema';
import { TimebankDatabase } from './helpers/timebankDatabase';
import { claimOrganization } from '../src/organizationIam';
import { runPortalBrandingOperation } from '../src/portalBrandingMcp';
import { resolveBrandPalette } from '../../shared/brandPalette';
const identity = { userId: 'owner', scopes: ['org:portal.read', 'org:portal.write'] };

test('brand palette uses named medical defaults and stored overrides, including repeated hex values', () => {
  const site = { profile: 'lifetech', accent_color: '#155e59' };
  const defaults = resolveBrandPalette(site);
  assert.deepEqual(defaults.map(c => [c.label, c.value]), [['HealthTech Teal', '#155e59'], ['MedTech OffWhite', '#F4F5F0'], ['BioTech Gold', '#D4AF37']]);
  assert.match(defaults[1].description!, /MRI/);
  assert.deepEqual(resolveBrandPalette({ ...site, profile: 'community', slug: 'lifetech' }), defaults);
  const palette = [{ label: 'Updated', value: '#112233', description: 'New meaning' }, { label: 'Same value', value: '#112233' }];
  assert.deepEqual(resolveBrandPalette({ ...site, feature_config: JSON.stringify({ brandPalette: palette }) }), palette);
  assert.deepEqual(resolveBrandPalette({ ...site, feature_config: { brandPalette: [{ label: 'Invalid', value: 'red' }] } }), defaults);
  assert.equal(resolveBrandPalette({ profile: 'community', accent_color: '#123456' })[0].label, 'Accent');
});

test('MCP palette changes enforce management, scope, preview freshness and one-use apply while preserving portal settings', async () => {
  const db = new TimebankDatabase();
  for (const file of ['0002_org_event_directories.sql', '0015_organization_iam.sql', '0067_pending_organizers.sql', '0029_portal_tenant_deployment_model.sql', '0032_portal_tenant_org_slug.sql', '0017_event_mcp_operations.sql'])
    db.sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  db.sqlite.exec("INSERT INTO organizations(id,name,slug,tags,city) VALUES ('org','LifeTech','lifetech','[]','Baltimore')");
  await claimOrganization(db.asD1(), 'org', { id: 'owner', name: 'Owner', email: null, isOperator: false }, new Date().toISOString());
  db.sqlite.exec(`INSERT INTO group_sites(id,organization_id,hostname,name,tagline,accent_color,profile,features,home_org_slug,feature_config)
    VALUES ('life','org','lifetech.example','LifeTech','Health','#155e59','community','[]','lifetech','{"other":{"enabled":true}}')`);
  const run = (who: typeof identity, operation: 'get' | 'update', args: unknown) => runPortalBrandingOperation(db.asD1(), who, operation, args);
  const args = { organizationId: 'org', palette: [{ label: 'New teal', value: '#123456', description: 'Editable meaning' }] };
  try {
    await assert.rejects(run({ ...identity, scopes: ['org:portal.read'] }, 'update', args), /scope/);
    await assert.rejects(run({ ...identity, userId: 'outsider' }, 'update', args), /management/);
    await assert.rejects(run(identity, 'update', { ...args, palette: [{ label: 'Invalid', value: 'red' }] }));
    await assert.rejects(run(identity, 'update', { ...args, confirm: true }), /preview first/);
    const original = await run(identity, 'get', { organizationId: 'org' });
    assert.equal(original.palette![0].label, 'HealthTech Teal');
    const preview = await run(identity, 'update', args);
    assert.equal((await run(identity, 'get', { organizationId: 'org' })).palette![0].label, 'HealthTech Teal');
    db.sqlite.exec(`UPDATE group_sites SET feature_config = json_set(feature_config,'$.concurrent',true) WHERE id='life'`);
    await assert.rejects(run(identity, 'update', { ...args, confirm: true, previewId: preview.previewId }), /changed/);
    const fresh = await run(identity, 'update', args);
    const saved = await run(identity, 'update', { ...args, confirm: true, previewId: fresh.previewId });
    assert.deepEqual(saved.palette, args.palette);
    assert.deepEqual((await run(identity, 'get', { organizationId: 'org' })).palette, args.palette);
    const row = db.sqlite.prepare("SELECT * FROM group_sites WHERE id='life'").get()!;
    assert.equal(row.profile, 'community'); assert.equal(row.hostname, 'lifetech.example'); assert.equal(row.accent_color, '#155e59');
    assert.deepEqual(JSON.parse(row.feature_config as string).other, { enabled: true });
    await assert.rejects(run(identity, 'update', { ...args, confirm: true, previewId: fresh.previewId }), /already used|changed/);
  } finally { db.sqlite.close(); }
});
