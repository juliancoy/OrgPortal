import { expect, test, type Page, type Route } from '@playwright/test'

const authUser = { id: 'member-current', email: 'member@example.test', full_name: 'Current Member' }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockOrganizations(page: Page) {
  let organizations = [
    {
      id: 'org-open', name: 'Open Workshop', slug: 'open-workshop', description: 'An unclaimed imported organization.',
      source_url: 'https://example.test/open', source_urls: ['https://example.test/open'], image_url: null, tags: [],
      seeded_from_events: true, claimed_by_user_id: null, membership_count: 0, my_role: null,
      ownership_status: 'unclaimed', pending_challenges_count: 0,
    },
    {
      id: 'org-claimed', name: 'Claimed Workshop', slug: 'claimed-workshop', description: 'An organization with an owner.',
      source_url: null, source_urls: [], image_url: null, tags: [], seeded_from_events: false,
      claimed_by_user_id: 'member-other', membership_count: 1, my_role: null,
      ownership_status: 'claimed', pending_challenges_count: 0,
    },
  ]

  await page.route('**/api/org/**', (route) => json(route, {}))
  await page.route('**/auth/session-token', (route) => json(route, { access_token: 'header.payload.signature' }))
  await page.route('**/auth/me', (route) => json(route, authUser))
  await page.route('**/api/org/admin/me', (route) => json(route, { is_sysadmin: false }))
  await page.route('**/api/org/api/network/orgs?**', (route) => json(route, organizations))
  await page.route('**/api/org/api/network/orgs/org-open/claim', async (route) => {
    organizations = organizations.map((organization) => organization.id === 'org-open'
      ? { ...organization, claimed_by_user_id: authUser.id, membership_count: 1, my_role: 'owner', ownership_status: 'claimed' }
      : organization)
    await json(route, organizations[0])
  })
  await page.route('**/api/org/api/network/orgs/org-claimed/ownership-challenges', async (route) => {
    expect(JSON.parse(route.request().postData() || '{}')).toEqual({ explanation: 'The current membership elected me.' })
    organizations = organizations.map((organization) => organization.id === 'org-claimed'
      ? { ...organization, ownership_status: 'disputed', pending_challenges_count: 1 }
      : organization)
    await json(route, { id: 'challenge-1', status: 'open' }, 201)
  })
}

test('a member claims an open organization and challenges an existing owner', async ({ page }) => {
  await mockOrganizations(page)
  await page.goto('/orgs/profile')

  await expect(page.getByRole('heading', { name: 'Organization Network' })).toBeVisible()
  const openOrganization = page.locator('article').filter({ hasText: 'Open Workshop' })
  await openOrganization.getByRole('button', { name: 'Claim', exact: true }).click()
  await expect(page.getByText('Organization claimed. You are now its owner.')).toBeVisible()
  await expect(openOrganization.getByText('Ownership: claimed')).toBeVisible()
  await expect(openOrganization.getByRole('button', { name: 'Manage Members' })).toBeVisible()

  const claimedOrganization = page.locator('article').filter({ hasText: 'Claimed Workshop' })
  await claimedOrganization.getByPlaceholder('Why should ownership change?').fill('The current membership elected me.')
  await claimedOrganization.getByRole('button', { name: 'Challenge ownership' }).click()
  await expect(page.getByText('Ownership challenge filed. The organization is now marked disputed.')).toBeVisible()
  await expect(claimedOrganization.getByText(/Ownership: disputed.*1 open challenge/)).toBeVisible()
})
