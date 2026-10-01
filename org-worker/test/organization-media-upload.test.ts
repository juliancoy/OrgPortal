import test from 'node:test';
import assert from 'node:assert/strict';
import { EventTestDb } from './event-test-db';
import { uploadOrganizationMedia, handleOrganizationMediaUpload } from '../src/organizationMediaUpload';

const identity = { userId: 'pidp-user', scopes: ['org:portal.read', 'org:portal.write'] };

async function fixture() {
  const db = new EventTestDb();
  const objects = new Map();
  const env = { DB: db, SCAN_IMAGES: { async put(key, data) { objects.set(key, data); }, async delete(key) { objects.delete(key); } } } as unknown as Env;
  return { db, objects, env };
}

function request(fields: Record<string, string> = {}, bytes = [255, 216, 255, 224]) {
  const form = new FormData();
  form.set('organizationId', 'org-one');
  form.set('image', new File([new Uint8Array(bytes)], 'campus.jpg', { type: 'image/jpeg' }));
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  return new Request('https://portal.example/mcp/uploads/organization-media', { method: 'POST', body: form });
}

test('organization upload previews, appends, audits and rejects replay without another object', async () => {
  const f = await fixture(); try {
    const preview = await uploadOrganizationMedia(request(), f.env, identity);
    assert.equal(preview.dryRun, true);
    assert.equal(preview.organizationName, 'One');
    assert.equal(f.objects.size, 0);
    const result = await uploadOrganizationMedia(request({ confirm: 'true', previewId: preview.previewId }), f.env, identity);
    assert.equal(result.success, true);
    assert.equal(f.objects.size, 1);
    const row = await f.db.prepare('SELECT media_json FROM organizations WHERE id = ?').bind('org-one').first();
    const media = JSON.parse(row.media_json);
    assert.equal(media[0].label, 'campus.jpg');
    assert.match(media[0].url, /\/api\/network\/orgs\/public\/one\/media\//);
    assert.equal((await f.db.prepare('SELECT status FROM event_mcp_operations').first()).status, 'completed');
    await assert.rejects(uploadOrganizationMedia(request({ confirm: 'true', previewId: preview.previewId }), f.env, identity), /Preview/);
    assert.equal(f.objects.size, 1);
  } finally { f.db.close(); }
});

test('organization upload denies missing scopes, inactive membership, tampering and unpreviewed writes', async () => {
  const f = await fixture(); try {
    await assert.rejects(uploadOrganizationMedia(request(), f.env, { ...identity, scopes: ['org:portal.read'] }), /scope/);
    await assert.rejects(uploadOrganizationMedia(request(), f.env, { ...identity, userId: 'other-user' }), /management/);
    await assert.rejects(uploadOrganizationMedia(request({ confirm: 'true' }), f.env, identity), /Preview/);
    await assert.rejects(uploadOrganizationMedia(request({}, [1, 2, 3]), f.env, identity), /content/);
    const preview = await uploadOrganizationMedia(request(), f.env, identity);
    await assert.rejects(uploadOrganizationMedia(request({ confirm: 'true', previewId: preview.previewId }, [255, 216, 255, 225]), f.env, identity), /Preview/);
    await f.db.prepare("UPDATE organization_memberships SET status='inactive'").run();
    await assert.rejects(uploadOrganizationMedia(request({ confirm: 'true', previewId: preview.previewId }), f.env, identity), /management/);
    assert.equal(f.objects.size, 0);
  } finally { f.db.close(); }
});

test('concurrent organization gallery edit during storage write is retained and unattached object removed', async () => {
  const f = await fixture(); try {
    const preview = await uploadOrganizationMedia(request(), f.env, identity);
    const put = f.env.SCAN_IMAGES!.put;
    f.env.SCAN_IMAGES!.put = async (...args) => {
      await f.db.prepare('UPDATE organizations SET media_json = ? WHERE id = ?').bind('[{"id":"concurrent"}]', 'org-one').run();
      return put(...args);
    };
    const result = await uploadOrganizationMedia(request({ confirm: 'true', previewId: preview.previewId }), f.env, identity);
    assert.equal(result.success, false);
    assert.equal(f.objects.size, 0);
    assert.equal((await f.db.prepare('SELECT media_json FROM organizations WHERE id = ?').bind('org-one').first()).media_json, '[{"id":"concurrent"}]');
  } finally { f.db.close(); }
});

test('organization OAuth upload endpoint requires a token and live revocation configuration', async () => {
  const f = await fixture(); try {
    Object.assign(f.env, { MCP_PUBLIC_URL: 'https://portal.example/mcp', MCP_OAUTH_ISSUER: 'https://id.example',
      MCP_OAUTH_JWKS_URL: 'https://id.example/.well-known/jwks.json', MCP_SUBJECT_MAP_JSON: '{}' });
    assert.equal((await handleOrganizationMediaUpload(request(), f.env)).status, 503);
    Object.assign(f.env, { MCP_OAUTH_INTROSPECTION_URL: 'https://id.example/oauth/mcp/introspect', MCP_OAUTH_INTROSPECTION_SECRET: 'secret' });
    const response = await handleOrganizationMediaUpload(request(), f.env);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate')!, /resource_metadata/);
    assert.equal(f.objects.size, 0);
  } finally { f.db.close(); }
});
