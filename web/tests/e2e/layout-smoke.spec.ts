import { expect, test } from '@playwright/test'

async function mockAuth(page: import('@playwright/test').Page) {
  await page.route('**/auth/session-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'header.payload.signature' }),
    })
  })

  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-1',
        email: 'mobile@test.org',
        full_name: 'Mobile Tester',
        avatar_url: null,
        identity_data: null,
      }),
    })
  })

  await page.route('**/api/org/admin/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ is_sysadmin: false }),
    })
  })
}

test.describe('OrgPortal responsive shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
  })

  test('profile dropdown stays fully inside viewport', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.portal-user-trigger')
    await page.click('.portal-user-trigger')

    const menu = page.locator('.portal-user-menu')
    await expect(menu).toBeVisible()

    const box = await menu.boundingBox()
    const viewport = page.viewportSize()

    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()

    if (!box || !viewport) return

    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  })

  test('key routes do not introduce horizontal overflow', async ({ page }) => {
    const routes = ['/', '/events', '/orgs', '/people']

    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          delta: doc.scrollWidth - doc.clientWidth,
        }
      })

      expect(overflow.delta, `horizontal overflow at ${route}: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(1)
    }
  })
})
