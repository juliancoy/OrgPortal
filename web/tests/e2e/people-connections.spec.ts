import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/org/api/portal/tenant', route => route.fulfill({ json: { id: 'lifetech', hostname: 'localhost', name: 'LifeTech', profile: 'community', features: ['directory', 'events', 'chat'], accent_color: '#155e59' } }))
  await page.route('**/auth/session-token', route => route.fulfill({ json: { access_token: 'local-test-token' } }))
  await page.route('**/auth/me', route => route.fulfill({ json: { id: 'self', full_name: 'Local Tester', email: 'test@example.test' } }))
  await page.route('**/api/org/api/network/orgs/public?**', route => route.fulfill({ json: [] }))
  await page.route('**/api/org/api/network/users?**', route => route.fulfill({ json: [
    { user_id: 'self', user_name: 'Local Tester', connection_status: 'self' },
    { user_id: 'jordan', user_name: 'Jordan Contact', connection_status: 'none', created_at: '2026-01-01', updated_at: '2026-09-29' },
  ] }))
})

test('connection request is styled, keyboard accessible, and prevents repeated requests', async ({ page }) => {
  let count = 0
  let complete!: () => void
  const responseReady = new Promise<void>(resolve => { complete = resolve })
  await page.route('**/api/org/api/network/connections/request', async route => {
    count++
    expect(route.request().postDataJSON()).toEqual({ target_user_id: 'jordan' })
    await responseReady
    await route.fulfill({ json: { status: 'pending' } })
  })
  await page.goto('/people')
  const button = page.getByRole('button', { name: 'Connect with Jordan Contact' })
  await expect(button).toBeVisible()
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(button).toBeDisabled()
  await expect(button).toHaveText('Connecting…')
  complete()
  await expect(page.getByRole('status')).toHaveText('Connection request sent to Jordan Contact.')
  await expect(page.getByText('Connection pending', { exact: true })).toBeVisible()
  await expect(button).toHaveCount(0)
  expect(count).toBe(1)
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(accessibility.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: 'Connect with Local Tester' })).toHaveCount(0)
})

test('a failed connection leaves a usable retry and readable error', async ({ page }) => {
  let fail = true
  await page.route('**/api/org/api/network/connections/request', route => route.fulfill(fail
    ? { status: 503, body: '<html>Service unavailable</html>', contentType: 'text/html' }
    : { json: { status: 'pending' } }))
  await page.goto('/people')
  const button = page.getByRole('button', { name: 'Connect with Jordan Contact' })
  await button.click()
  await expect(page.getByRole('status')).toHaveText('Unable to send the connection request. Please try again.')
  await expect(button).toBeEnabled()
  fail = false
  await button.click()
  await expect(page.getByText('Connection pending', { exact: true })).toBeVisible()
})
