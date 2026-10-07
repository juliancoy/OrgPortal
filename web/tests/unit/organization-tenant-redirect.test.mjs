import test from 'node:test';
import assert from 'node:assert/strict';
import { organizationTenantRedirect } from '../../organizationTenantRedirect.mjs';

test('client navigation transfers to another tenant while retaining the active tenant dashboard', () => {
  const org = { tenant_id: 'life', tenant_home_url: 'https://lifetech.fyi/' };
  assert.equal(organizationTenantRedirect(org, 'https://medtech.social/orgs/lifetech'), 'https://lifetech.fyi/');
  assert.equal(organizationTenantRedirect(org, 'https://lifetech.fyi/orgs/lifetech', 'life'), null);
  const slugTenant = { tenant_id: 'life', tenant_home_url: 'https://codecollective.us/p/portals/lifetech' };
  assert.equal(organizationTenantRedirect(slugTenant, 'https://codecollective.us/p/orgs/lifetech?view=public#events', 'another'), 'https://codecollective.us/p/portals/lifetech?view=public#events');
  assert.equal(organizationTenantRedirect(slugTenant, 'https://codecollective.us/p/orgs/lifetech', 'life'), null);
  assert.equal(organizationTenantRedirect({}, 'https://medtech.social/orgs/partner'), null);
});
