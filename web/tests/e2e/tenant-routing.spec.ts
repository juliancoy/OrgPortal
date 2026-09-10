import { expect, test, type Page } from '@playwright/test'

test.use({ video: 'off' })

const basePath = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').pathname.replace(/\/$/, '')
const portal = (path: string) => `${basePath}${path}`

async function mockTenant(page: Page) {
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
    return route.fulfill({ json: [] })
  })
  await page.route('**/pidp/**', async route => {
    const url = new URL(route.request().url())
    if (/\/auth\/(google|github)\/login$/.test(url.pathname) || url.pathname.endsWith('/app/login')) {
      await route.fulfill({ status: 302, headers: { location: url.searchParams.get('next')! } })
      return
    }
    await route.fulfill({ status: 401, json: {} })
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
