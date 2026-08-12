import { expect, test } from '@playwright/test'

test('guest provider route redirects to login and uses portal-scoped social assets', async ({ page }) => {
  await page.route('**/auth/session-token', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })

  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Not authenticated' }),
    })
  })

  await page.goto('/provider-scheduling')
  await expect(page).toHaveURL(/\/users\/login\?next=%2Fprovider-scheduling$/)
  await expect(page.getByRole('heading', { name: 'Log In' })).toBeVisible()

  const googleLogo = page.locator('img.portal-social-login-logo').first()
  const githubLogo = page.locator('img.portal-social-login-logo').nth(1)
  await expect(googleLogo).toHaveAttribute('src', /\/(?:p\/)?images\/google-g-logo\.svg$/)
  await expect(githubLogo).toHaveAttribute('src', /\/(?:p\/)?images\/github-mark\.svg$/)
})
