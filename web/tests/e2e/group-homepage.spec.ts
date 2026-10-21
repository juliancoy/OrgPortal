import { expect, test } from '@playwright/test'

// Public fixture only; no authenticated sessions or external group data.
test('group profile stays in OrgPortal and links to its branded homepage', async ({ page }) => {
  await page.route('**/auth/session-token', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/auth/me', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/users/me**', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/org/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path.endsWith('/api/portal/site')) body = {}
    else if (path.endsWith('/orgs/public/workshop')) body = {
      id: 'workshop', slug: 'workshop', name: 'Workshop group',
      description: 'A group on OrgPortal', group_home_url: 'https://workshop.example/',
      source_url: 'https://meetup.example/workshop', membership_count: 0,
      pending_challenges_count: 0, media: [],
    }
    else if (path.endsWith('/workshop/support')) body = { descendants: [], supporters: [], records: [] }
    await route.fulfill({ json: body })
  })
  await page.goto('/orgs/workshop?view=public#organization-overview')
  await expect(page.getByRole('heading', { name: 'Workshop group', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/orgs\/workshop\?view=public#organization-overview$/)
  await expect(page.getByRole('link', { name: 'Group homepage', exact: true })).toHaveAttribute('href', 'https://workshop.example/')
  await expect(page.getByRole('link', { name: 'Website', exact: true })).toHaveAttribute('href', 'https://meetup.example/workshop')
  const login = new URL(await page.getByRole('link', { name: 'Log in to join', exact: true }).getAttribute('href') || '', page.url())
  expect(login.searchParams.get('app')).toBe('orgportal')
  expect(new URL(login.searchParams.get('next')!).searchParams.get('next')).toBe('/orgs/workshop')
})

test('sign-in describes one OrgPortal account on a branded group site', async ({ page }) => {
  await page.route('**/auth/session-token', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/auth/me', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/org/**', route => route.fulfill({ json: {
    id: 'workshop-site', organization_id: 'workshop', hostname: 'localhost',
    name: 'Workshop', tagline: 'Workshop community', profile: 'community',
    features: ['directory', 'events', 'chat'], accent_color: '#155e59',
  } }))
  await page.route('**/auth/sso/start?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>PIdP sign-in</h1>' }))
  await page.goto('/users/login?next=/orgs/workshop')
  await expect(page.getByRole('heading', { name: 'PIdP sign-in' })).toBeVisible()
  const login = new URL(page.url())
  expect(login.searchParams.get('app')).toBe('orgportal')
  expect(login.searchParams.has('owner')).toBe(false)
  expect(new URL(login.searchParams.get('next')!).searchParams.get('next')).toBe('/orgs/workshop')
})
