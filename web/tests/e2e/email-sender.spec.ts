import { expect, test } from '@playwright/test'

// Isolated UI fixtures: no real identity, Google connection, or email delivery.
test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } })
for (const scenario of ['no group', 'group data fails', 'sender fails then retries']) {
  test(`sender loading: ${scenario}`, async ({ page, baseURL }) => {
    if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Run email fixtures on localhost only')
    let senderFails = scenario === 'sender fails then retries'
    await page.route('**/api/org/**', route => route.fulfill({ json: {} }))
    await page.route('**/auth/session-token', route => route.fulfill({ json: { access_token: 'fixture.payload.signature' } }))
    await page.route('**/auth/me', route => route.fulfill({ json: { id: 'fixture', email: 'sender@example.test', full_name: 'Test organizer', is_admin: true } }))
    await page.route('**/api/org/api/email/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/groups')) return route.fulfill({ json: [{ id: 'group', name: 'Test group' }] })
      if (path.endsWith('/sender')) {
        if (senderFails) return route.fulfill({ status: 503, json: { detail: 'Sender service unavailable.' } })
        return route.fulfill({ json: { configured: true, setup_issues: [], email: 'sender@example.test', from_email: 'sender@example.test', sending_enabled: false, connected: false, status: 'disconnected', cooldown_until: 0 } })
      }
      if (path.endsWith('/events') && scenario === 'group data fails') return route.fulfill({ status: 503, json: { detail: 'Events unavailable.' } })
      if (path.endsWith('/audience')) return route.fulfill({ json: { contacts: [], event_count: 0, organization_count: 0 } })
      return route.fulfill({ json: [] })
    })
    await page.goto(`/email${scenario === 'group data fails' ? '?organization_id=group' : ''}`)
    if (scenario === 'sender fails then retries') {
      await expect(page.getByText('Sender unavailable', { exact: true })).toBeVisible()
      await expect(page.getByText('Loading sender…', { exact: true })).toHaveCount(0)
      senderFails = false
      await page.getByRole('button', { name: 'Retry sender' }).click()
    }
    await expect(page.getByText('sender@example.test', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect Google Workspace', exact: true })).toBeEnabled()
    if (scenario === 'group data fails') await expect(page.getByText('Events unavailable.', { exact: true })).toBeVisible()
    else {
      await expect(page.getByText('Choose a group above to compose an email and view its campaigns.')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Compose a group email' })).toHaveCount(0)
    }
  })
}
