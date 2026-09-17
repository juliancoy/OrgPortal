import { expect, test, type Page } from '@playwright/test'

const request = `login_${'a'.repeat(54)}`
const path = `/users/mcp-connect?request=${request}`

async function account(page: Page, signedIn: boolean) {
  await page.route('**/api/org/**', route => route.fulfill({ json: {} }))
  await page.route('**/auth/session-token', route => route.fulfill({
    status: signedIn ? 200 : 401, json: signedIn ? { access_token: 'header.payload.signature' } : {},
  }))
  await page.route('**/auth/me', route => route.fulfill({
    status: signedIn ? 200 : 401, json: signedIn ? { id: 'member', email: 'member@example.test', full_name: 'Portal Member' } : {},
  }))
}

test('MCP login uses the existing social login and retains its return path', async ({ page }) => {
  await account(page, false)
  await page.goto(path)
  await expect(page).toHaveURL(/\/users\/login\?next=/)
  const next = new URL(page.url()).searchParams.get('next')
  expect(next).toBe(path)
  const google = page.getByRole('link', { name: 'Continue with Google' })
  await expect(google).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue with GitHub' })).toBeVisible()
  const social = new URL(await google.getAttribute('href') || '', page.url())
  expect(new URL(social.searchParams.get('next') || '').searchParams.get('next')).toBe(path)
})

test('MCP continuation requires an explicit action and safely returns to the issuer', async ({ page }, testInfo) => {
  await account(page, true)
  let posts = 0
  await page.route('**/oauth/mcp/handoff*', async route => {
    if (route.request().method() === 'POST') {
      posts++
      expect(new URLSearchParams(route.request().postData() || '').get('request')).toBe(request)
      await route.fulfill({ json: { redirect_url: 'https://id.example/oauth/mcp/resume?code=one-use-code' } })
    } else {
      await route.fulfill({ json: { portal: 'MedTech', portal_origin: new URL(page.url()).origin, issuer: 'https://id.example', account: 'member@example.test' } })
    }
  })
  await page.route('https://id.example/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>MCP consent</h1>' }))
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Connect MedTech' })).toBeVisible()
  await expect(page.getByText('member@example.test', { exact: true })).toBeVisible()
  expect(posts).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mcp-connect.png'), fullPage: true })
  await page.getByRole('button', { name: 'Continue to consent' }).click()
  await expect(page).toHaveURL('https://id.example/oauth/mcp/resume?code=one-use-code')
  expect(posts).toBe(1)
})

test('MCP continuation rejects an unexpected issuer destination', async ({ page }) => {
  await account(page, true)
  await page.route('**/oauth/mcp/handoff*', route => route.fulfill({ json: route.request().method() === 'POST'
    ? { redirect_url: 'https://evil.example/oauth/mcp/resume?code=stolen' }
    : { portal: 'MedTech', portal_origin: new URL(page.url()).origin, issuer: 'https://id.example', account: 'member@example.test' },
  }))
  await page.goto(path)
  await page.getByRole('button', { name: 'Continue to consent' }).click()
  await expect(page.getByRole('alert')).toHaveText('The identity provider returned an invalid destination.')
  await expect(page).toHaveURL(/\/users\/mcp-connect\?request=/)
})

test('MCP continuation reports an expired request without sending a confirmation', async ({ page }) => {
  await account(page, true)
  await page.route('**/oauth/mcp/handoff*', route => route.fulfill({ status: 400, json: { error: 'login_expired' } }))
  await page.goto(path)
  await expect(page.getByRole('alert')).toContainText('expired')
  await expect(page.getByRole('button', { name: 'Continue to consent' })).toHaveCount(0)
})
