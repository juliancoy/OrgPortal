import { expect, test, type Page } from '@playwright/test'

const request = `login_${'a'.repeat(54)}`
const path = `/users/mcp-connect?request=${request}`

async function account(page: Page, signedIn: boolean) {
  await page.route('**/api/org/**', route => route.fulfill({ json: {} }))
  await page.route('**/api/org/api/tasks*', route => route.fulfill({ json: { tasks: [] } }))
  await page.route('**/auth/session-token', route => route.fulfill({
    status: signedIn ? 200 : 401, json: signedIn ? { access_token: 'header.payload.signature' } : {},
  }))
  await page.route('**/auth/me', route => route.fulfill({
    status: signedIn ? 200 : 401, json: signedIn ? { id: 'member', email: 'member@example.test', full_name: 'Portal Member' } : {},
  }))
}

test('MCP login delegates to the shared account and retains its return path', async ({ page }) => {
  await account(page, false)
  await page.route('**/auth/sso/start?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>PIdP sign-in</h1>' }))
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'PIdP sign-in' })).toBeVisible()
  const destination = new URL(page.url())
  expect(destination.pathname).toBe('/pidp/auth/sso/start')
  expect(destination.searchParams.get('app')).toBe('orgportal')
  expect(destination.searchParams.has('owner')).toBe(false)
  const callback = new URL(destination.searchParams.get('next')!)
  expect(callback.pathname).toBe('/auth/callback')
  expect(callback.searchParams.get('next')).toBe(path)
})

test('MCP continuation opens one combined account and permissions review', async ({ page }) => {
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

test('MCP handoff distinguishes an inactive browser session and offers same-account sign-in with the return request', async ({ page }) => {
  await account(page, true)
  await page.route('**/oauth/mcp/handoff*', route => route.fulfill({ status: 401, json: { error: 'login_required' } }))
  await page.goto(path)
  await expect(page.getByRole('alert')).toContainText('browser sign-in is no longer active')
  const link = page.getByRole('link', { name: 'Sign in again', exact: true })
  await expect(link).toBeVisible()
  const destination = new URL(await link.getAttribute('href') || '', page.url())
  expect(destination.pathname).toContain('/auth/sso/start')
  const callback = new URL(destination.searchParams.get('next') || '')
  expect(new URL(callback.searchParams.get('next') || '', page.url()).searchParams.get('request')).toBe(request)
  await expect(page.getByRole('button', { name: 'Continue to consent' })).toHaveCount(0)
})

async function consentDestination(page: Page) {
  await page.route('https://id.example/oauth/mcp/resume?*', route => route.fulfill({
    contentType: 'text/html', body: '<h1>Fresh permissions review</h1>',
  }))
}
const handoffMetadata = (page: Page) => ({ portal_origin: new URL(page.url()).origin, issuer: 'https://id.example' })

test('an interrupted handoff read offers an explicit retry and confirms only once after recovery', async ({ page }) => {
  await account(page, true)
  let reads = 0, posts = 0
  await page.route('**/oauth/mcp/handoff*', async route => {
    if (route.request().method() === 'GET') {
      reads++
      if (reads === 1) return route.abort('internetdisconnected')
      return route.fulfill({ json: handoffMetadata(page) })
    }
    posts++
    return route.fulfill({ json: { redirect_url: 'https://id.example/oauth/mcp/resume?code=fresh-review' } })
  })
  await consentDestination(page)
  await page.goto(path)
  await expect(page.getByRole('alert')).toContainText('before account confirmation')
  expect(reads).toBe(1); expect(posts).toBe(0)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fresh permissions review' })).toBeVisible()
  expect(reads).toBe(2); expect(posts).toBe(1)
})

test('temporary service unavailability keeps confirmation inert until an explicit retry', async ({ page }) => {
  await account(page, true)
  let unavailable = true, posts = 0
  await page.route('**/oauth/mcp/handoff*', route => {
    if (route.request().method() === 'GET') return route.fulfill(unavailable
      ? { status: 503, json: { error: 'unavailable' } } : { json: handoffMetadata(page) })
    posts++
    return route.fulfill({ json: { redirect_url: 'https://id.example/oauth/mcp/resume?code=recovered' } })
  })
  await consentDestination(page)
  await page.goto(path)
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  expect(posts).toBe(0)
  unavailable = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fresh permissions review' })).toBeVisible()
  expect(posts).toBe(1)
})

test('a lost confirmation response is never replayed; reconnecting requires a fresh request', async ({ page }) => {
  await account(page, true)
  const fresh = `login_${'b'.repeat(54)}`
  const posted: string[] = []
  await page.route('**/oauth/mcp/handoff*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: handoffMetadata(page) })
    const id = new URLSearchParams(route.request().postData() || '').get('request')!
    posted.push(id)
    if (id === request) return route.abort('connectionreset')
    return route.fulfill({ json: { redirect_url: 'https://id.example/oauth/mcp/resume?code=fresh-connection' } })
  })
  await consentDestination(page)
  await page.goto(path)
  await expect(page.getByRole('alert')).toContainText('Start a new connection')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0)
  expect(posted).toEqual([request])
  await page.goto(`/users/mcp-connect?request=${fresh}`)
  await expect(page.getByRole('heading', { name: 'Fresh permissions review' })).toBeVisible()
  expect(posted).toEqual([request, fresh])
})

test('consent expiring between handoff read and confirmation cannot be retried as a valid grant', async ({ page }) => {
  await account(page, true)
  let posts = 0
  await page.route('**/oauth/mcp/handoff*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: handoffMetadata(page) })
    posts++
    return route.fulfill({ status: 400, json: { error: 'login_expired' } })
  })
  await page.goto(path)
  await expect(page.getByRole('alert')).toContainText('expired')
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0)
  expect(posts).toBe(1)
})

test('a missing browser session reconnects through sign-in while preserving the pending MCP request', async ({ page }) => {
  await account(page, true)
  let active = false, posts = 0
  await page.route('**/oauth/mcp/handoff*', route => {
    if (!active) return route.fulfill({ status: 401, json: { error: 'login_required' } })
    if (route.request().method() === 'GET') return route.fulfill({ json: handoffMetadata(page) })
    posts++
    return route.fulfill({ json: { redirect_url: 'https://id.example/oauth/mcp/resume?code=restored-session' } })
  })
  await page.route('**/auth/sso/start?**', async route => {
    const sso = new URL(route.request().url())
    const callback = new URL(sso.searchParams.get('next')!)
    const next = new URL(callback.searchParams.get('next')!, page.url())
    expect(next.searchParams.get('request')).toBe(request)
    active = true
    await route.fulfill({ status: 302, headers: { location: next.toString() } })
  })
  await consentDestination(page)
  await page.goto(path)
  await expect(page.getByRole('link', { name: 'Sign in again', exact: true })).toBeVisible()
  expect(posts).toBe(0)
  await page.getByRole('link', { name: 'Sign in again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fresh permissions review' })).toBeVisible()
  expect(posts).toBe(1)
})

for (const phase of ['metadata', 'confirmation'] as const) {
  test(`an incomplete ${phase} response offers only the safe recovery action`, async ({ page }) => {
    await account(page, true)
    let posts = 0
    await page.route('**/oauth/mcp/handoff*', route => {
      const post = route.request().method() === 'POST'
      if (post) posts++
      if ((!post && phase === 'metadata') || (post && phase === 'confirmation')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{' })
      }
      return route.fulfill({ json: handoffMetadata(page) })
    })
    await page.goto(path)
    await expect(page.getByRole('alert')).toBeVisible()
    if (phase === 'metadata') {
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
      expect(posts).toBe(0)
    } else {
      await expect(page.getByRole('alert')).toContainText('Start a new connection')
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0)
      expect(posts).toBe(1)
    }
  })
}
