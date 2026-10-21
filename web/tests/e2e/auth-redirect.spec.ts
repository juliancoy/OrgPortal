import { expect, test } from '@playwright/test'

test('guest provider route delegates to shared PIdP sign-in with its return path', async ({ page }) => {
  await page.route('**/api/org/api/portal/site', route => route.fulfill({ json: {} }))
  await page.route('**/auth/session-token', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/auth/me', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/auth/sso/start?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>PIdP sign-in</h1>' }))
  await page.goto('/provider-scheduling')
  await expect(page.getByRole('heading', { name: 'PIdP sign-in' })).toBeVisible()
  const destination = new URL(page.url())
  expect(destination.pathname).toBe('/pidp/auth/sso/start')
  expect(destination.searchParams.get('app')).toBe('orgportal')
  expect(destination.searchParams.has('owner')).toBe(false)
  expect(new URL(destination.searchParams.get('next')!).searchParams.get('next')).toBe('/provider-scheduling')
})
