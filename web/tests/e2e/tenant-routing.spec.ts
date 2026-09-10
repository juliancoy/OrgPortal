import { expect, test, type Page } from '@playwright/test'

test.use({ video: 'off' })

const basePath = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').pathname.replace(/\/$/, '')
const portal = (path: string) => `${basePath}${path}`

type MockTenantOptions = {
  completeAppLogin?: boolean
}

const medtechEvent = {
  id: 'evt-medtech-hut',
  title: 'MedTech in the Hut',
  slug: 'medtech-in-the-hut',
  description: 'A Baltimore MedTech event.',
  starts_at: '2026-09-29T18:00:00-04:00',
  ends_at: '2026-09-29T20:00:00-04:00',
  location: 'Checkerspot Brewing',
  organization_name: 'Baltimore MedTech',
  host_org_name: 'Baltimore MedTech',
  host_org_id: 'org-medtech',
}

async function mockTenant(page: Page, options: MockTenantOptions = {}) {
  let loggedIn = false
  await page.route('**/api/org/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/portal/tenant')) {
      return route.fulfill({ json: {
        id: 'baltimore-medtech',
        hostname: 'medtech.social',
        name: 'Baltimore MedTech',
        tagline: 'Health x Medicine x Biotech',
        accent_color: '#0f6f8f',
        profile: 'baltimore-medtech',
        features: ['directory', 'events', 'chat'],
        brand_image_path: '/images/baltimore-medtech-logo-square.jpg',
        home_url: 'https://medtech.social/',
        member_home_path: '/chat',
        manifest_path: '/medtech.webmanifest',
        theme_color: '#061a26',
        home_kind: 'auth',
        home_org_slug: 'baltimore-medtech',
        home_primary_label: 'Join Baltimore MedTech',
        home_primary_href: '/users/register',
        home_secondary_label: 'Browse MedTech Events',
        home_secondary_href: '/org-events',
        public_base_url: 'https://medtech.social',
        canonical_path_prefix: '',
        feature_config: { externalCalendarUrl: 'https://medtech.social/calendar.html' },
      } })
    }
    if (path.endsWith('/admin/me')) return route.fulfill({ json: { is_sysadmin: false } })
    if (path.includes('/network/orgs/public/baltimore-medtech/events')) return route.fulfill({ json: [] })
    if (path.endsWith('/network/events/public/medtech-in-the-hut/chat')) {
      return route.fulfill({ json: { event_slug: 'medtech-in-the-hut', room_exists: true, room_name: 'Event comments' } })
    }
    if (path.endsWith('/network/events/public/medtech-in-the-hut')) return route.fulfill({ json: medtechEvent })
    if (path.endsWith('/network/events/evt-medtech-hut/attendance')) {
      return route.fulfill({ json: { event_id: 'evt-medtech-hut', count: 2, registered: false, attendees: [] } })
    }
    return route.fulfill({ json: [] })
  })
  await page.route('**/pidp/**', async route => {
    const url = new URL(route.request().url())
    if (/\/auth\/(google|github)\/login$/.test(url.pathname) || url.pathname.endsWith('/app/login')) {
      if (options.completeAppLogin) loggedIn = true
      await route.fulfill({ status: 302, headers: { location: url.searchParams.get('next')! } })
      return
    }
    if (url.pathname.endsWith('/auth/session-token')) {
      await route.fulfill(loggedIn
        ? { json: { access_token: 'header.payload.signature' } }
        : { status: 401, json: {} })
      return
    }
    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill(loggedIn
        ? { json: { id: 'user-a', email: 'alice@example.test', full_name: 'Alice Example', identity_data: { display_name: 'Alice Example' } } }
        : { status: 401, json: {} })
      return
    }
    await route.fulfill({ status: 401, json: {} })
  })
  await page.route('**/api/network/chat/event-room', route => {
    return route.fulfill({ json: { conversation: { id: 'conv-event', kind: 'event', title: 'Event comments', updated_at: '2026-09-10T12:00:00Z' } } })
  })
  await page.route('**/api/network/chat/conversations/conv-event/messages?afterSequence=0', route => {
    return route.fulfill({ json: { latest_sequence: 0, messages: [] } })
  })
}

test('tenant domains use root-mounted canonical routes and assets', async ({ page }) => {
  await mockTenant(page)
  await page.goto(portal('/users/login'))

  await expect(page.locator('html')).toHaveAttribute('data-portal-profile', 'baltimore-medtech')
  await expect(page.locator('html')).toHaveAttribute('data-portal-tenant', 'baltimore-medtech')
  await expect(page.getByRole('heading', { name: 'Welcome to Baltimore MedTech' })).toBeVisible()
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/images\/baltimore-medtech-logo-square\.jpg$/)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /\/medtech\.webmanifest$/)

  const providerUrl = new URL((await page.getByRole('link', { name: 'Continue with Google' }).getAttribute('href'))!, 'http://portal.test')
  const callback = new URL(providerUrl.searchParams.get('next')!)
  expect(callback.pathname).toBe('/auth/callback')
  expect(callback.searchParams.has('portalProfile')).toBe(false)
  expect(callback.searchParams.get('next')).toBe('/chat')
})

test('tenant event auth actions return to the same root-mounted event', async ({ page }) => {
  await mockTenant(page, { completeAppLogin: true })
  await page.goto(portal('/events/medtech-in-the-hut'))

  await expect(page.getByRole('heading', { name: 'MedTech in the Hut' })).toBeVisible()
  await page.getByRole('link', { name: 'Login to Comment' }).click()

  await expect(page).toHaveURL(/\/auth\/callback\?next=%2Fevents%2Fmedtech-in-the-hut/)
  await expect(page).toHaveURL(/\/events\/medtech-in-the-hut$/)
  await expect(page.getByRole('heading', { name: 'MedTech in the Hut' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/404|not found/i)
})

test('tenant header login preserves the current event route', async ({ page }) => {
  await mockTenant(page, { completeAppLogin: true })
  await page.goto(portal('/events/medtech-in-the-hut'))

  await page.getByRole('link', { name: 'Log In' }).click()
  await expect(page).toHaveURL(/\/users\/login\?next=%2Fevents%2Fmedtech-in-the-hut$/)
  await page.getByRole('link', { name: 'Continue with Code Collective' }).click()

  await expect(page).toHaveURL(/\/events\/medtech-in-the-hut$/)
  await expect(page.getByRole('heading', { name: 'MedTech in the Hut' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/404|not found/i)
})
