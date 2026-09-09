import { expect, test as base, type Page } from '@playwright/test'

// Optional Docker Selenium transport; the same cases run with local Playwright.
const test = base.extend({
  browser: async ({ playwright }, use) => {
    const grid = process.env.SELENIUM_REMOTE_URL
    if (!grid) {
      const browser = await playwright.chromium.launch()
      await use(browser)
      await browser.close()
      return
    }
    const response = await fetch(`${grid}/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capabilities: { alwaysMatch: { browserName: 'chrome', 'goog:chromeOptions': { args: ['--headless=new', '--no-sandbox'] } } } }),
    })
    const { value } = await response.json() as { value: { sessionId: string; capabilities: Record<string, string> } }
    const endpoint = new URL(value.capabilities['se:cdp'])
    endpoint.host = new URL(grid).host
    const browser = await playwright.chromium.connectOverCDP(endpoint.toString())
    try { await use(browser) } finally {
      await browser.close()
      await fetch(`${grid}/session/${value.sessionId}`, { method: 'DELETE' })
    }
  },
})

const profile = 'portalProfile=baltimore-medtech'
test.use({ video: 'off' })
const basePath = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').pathname.replace(/\/$/, '')
const portal = (path: string) => `${basePath}${path}`
const user = { id: 'medtech-test', email: 'member@example.test', full_name: 'Jordan', identity_data: { first_name: 'Jordan' } }

async function mockServices(page: Page, authenticated = false) {
  let signedIn = authenticated
  await page.route('**/api/org/**', route => {
    const path = new URL(route.request().url()).pathname
    const body = path.endsWith('/timebank/community') ? { id: 'code-collective', name: 'Code Collective' }
      : path.endsWith('/admin/me') ? { is_sysadmin: false }
      : path.endsWith('/notifications/summary') ? { unread_count: 0 }
      : []
    return route.fulfill({ json: body })
  })
  await page.route('**/pidp/**', async route => {
    const url = new URL(route.request().url())
    if (/\/auth\/(google|github)\/login$/.test(url.pathname) || url.pathname.endsWith('/app/login')) {
      signedIn = true
      await route.fulfill({ status: 302, headers: { location: url.searchParams.get('next')! } })
    } else if (url.pathname.endsWith('/auth/register')) {
      const data = route.request().postDataJSON()
      await route.fulfill(data.email === 'existing@example.test'
        ? { status: 409, json: { detail: 'Account already exists. Please log in.' } }
        : { json: user })
    } else if (url.pathname.endsWith('/auth/session/login')) {
      signedIn = new URLSearchParams(route.request().postData() || '').get('password') === 'medtech-test-password'
      await route.fulfill(signedIn ? { json: { ok: true } } : { status: 401, json: { detail: 'Invalid credentials' } })
    } else if (url.pathname.endsWith('/auth/session-token')) {
      await route.fulfill(signedIn ? { json: { access_token: 'header.payload.signature' } } : { status: 401, json: {} })
    } else if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill(signedIn ? { json: user } : { status: 401, json: {} })
    } else if (url.pathname.endsWith('/auth/session/logout')) {
      signedIn = false
      await route.fulfill({ json: { ok: true } })
    } else await route.fulfill({ json: {} })
  })
  const startDate = new Date(Date.now() + 86400000).toISOString()
  await page.route('**/baltimore/upcoming_events.json', route => route.fulfill({ json: [
    { name: 'Baltimore biotech meetup', startDate, url: 'https://luma.com/medtech-test', location: { name: 'Baltimore' } },
    { name: 'Yoga in the park', startDate, url: 'https://luma.com/yoga-test' },
  ] }))
}

async function assertBrand(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-portal-profile', 'baltimore-medtech')
  await expect(page.locator('.portal-brand')).toHaveAttribute('href', 'https://medtech.social/')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /baltimore-medtech-logo-square\.jpg$/)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /medtech\.webmanifest$/)
  await expect(page.getByRole('link', { name: 'Powered by Code Collective' })).toBeVisible()
  const brandingImages = page.locator('.portal-brand img, .medtech-auth-logo')
  for (const image of await brandingImages.all()) {
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('MedTech entry, registration links, visual branding and system theme', async ({ page }, info) => {
  await mockServices(page)
  await page.goto(portal(`/?${profile}`))
  await expect(page.getByRole('heading', { name: 'Welcome to Baltimore MedTech' })).toBeVisible()
  await assertBrand(page)
  await expect(page.getByText('Your existing Code Collective account works here.')).toBeVisible()
  await page.screenshot({ path: info.outputPath('medtech-login-light.png'), fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(6, 26, 38)')
  for (const button of await page.locator('.portal-auth-register-shortcut, .portal-auth-idp-link, .portal-auth-submit').all()) {
    const contrast = () => button.evaluate(element => {
      const luminance = (color: string) => {
        const components = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
          const srgb = Number(value) / 255
          return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4
        })
        return components[0] * .2126 + components[1] * .7152 + components[2] * .0722
      }
      const style = getComputedStyle(element)
      const text = luminance(style.color), background = luminance(style.backgroundColor)
      return (Math.max(text, background) + .05) / (Math.min(text, background) + .05)
    })
    await expect.poll(contrast, { message: await button.innerText() }).toBeGreaterThanOrEqual(4.5)
  }
  await page.screenshot({ path: info.outputPath('medtech-login-dark.png'), fullPage: true })
  await page.getByRole('link', { name: 'Join Baltimore MedTech', exact: true }).click()
  await expect(page).toHaveURL(/users\/register\?.*portalProfile=baltimore-medtech/)
  await expect(page.getByRole('heading', { name: 'Join Baltimore MedTech' })).toBeVisible()
  await assertBrand(page)
  await page.screenshot({ path: info.outputPath('medtech-register.png'), fullPage: true })
})

test('password login validates errors and reaches the MedTech member home', async ({ page }, info) => {
  await mockServices(page)
  await page.goto(portal(`/users/login?${profile}`))
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Member login', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid credentials')
  await page.getByLabel(/^Password/).fill('medtech-test-password')
  await page.getByRole('button', { name: 'Member login', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your Baltimore MedTech community.' })).toBeVisible()
  await expect(page).toHaveURL(/community\?portalProfile=baltimore-medtech/)
  await assertBrand(page)
  await expect(page.getByRole('link', { name: 'Baltimore biotech meetup' })).toBeVisible()
  await expect(page.getByText('Yoga in the park')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('medtech-community.png'), fullPage: true })
  await page.getByRole('link', { name: 'Find MedTech people', exact: false }).click()
  await expect(page).toHaveURL(/search\?q=medtech&scope=people&portalProfile=baltimore-medtech/)
  await expect(page).toHaveTitle(/Baltimore MedTech/)
  await page.reload()
  await assertBrand(page)
})

test('registration preserves the requested destination and handles an existing account', async ({ page }) => {
  await mockServices(page)
  await page.goto(portal(`/users/register?${profile}&next=${encodeURIComponent('/people?from=welcome')}`))
  await page.getByLabel('Email', { exact: true }).fill('existing@example.test')
  await page.getByLabel(/^Password/).fill('medtech-test-password')
  await page.getByRole('button', { name: 'Join Baltimore MedTech', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  const login = page.getByRole('link', { name: /log\s?in/i }).last()
  const destination = new URL((await login.getAttribute('href'))!, 'http://portal.test')
  expect(destination.searchParams.get('portalProfile')).toBe('baltimore-medtech')
  expect(destination.searchParams.get('next')).toContain('/people?from=welcome')
  await page.goto(portal(`/users/register?${profile}&next=${encodeURIComponent('/people?from=welcome')}`))
  await page.getByLabel('Email', { exact: true }).fill('new-member@example.test')
  await page.getByLabel(/^Password/).fill('medtech-test-password')
  await page.getByRole('button', { name: 'Join Baltimore MedTech', exact: true }).click()
  await expect(page).toHaveURL(/people\?from=welcome&portalProfile=baltimore-medtech/)
  await assertBrand(page)
})

for (const provider of ['Google', 'GitHub']) {
  test(`${provider} return carries MedTech branding without browser storage`, async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked') } }) })
    await mockServices(page)
    await page.goto(portal(`/users/login?${profile}`))
    const link = page.getByRole('link', { name: `Continue with ${provider}`, exact: true })
    const providerUrl = new URL((await link.getAttribute('href'))!, 'http://portal.test')
    const callback = new URL(providerUrl.searchParams.get('next')!)
    expect(callback.searchParams.get('portalProfile')).toBe('baltimore-medtech')
    expect(callback.searchParams.get('next')).toBe('/community?portalProfile=baltimore-medtech')
    await link.click()
    await expect(page.getByRole('heading', { name: 'Your Baltimore MedTech community.' })).toBeVisible()
    await assertBrand(page)
  })
}

test('MedTech links do not change the Code Collective identity in another tab', async ({ page, context }) => {
  await mockServices(page)
  await page.goto(portal(`/users/login?${profile}`))
  await assertBrand(page)
  const central = await context.newPage()
  await mockServices(central)
  await central.goto(portal('/users/login'))
  await expect(central.getByRole('heading', { name: 'Log In', exact: true })).toBeVisible()
  await expect(central.locator('html')).toHaveAttribute('data-portal-profile', 'code-collective')
  await expect(central.locator('link[rel="icon"]')).toHaveAttribute('href', /codecollective_logo\.png$/)
  await page.goto(portal('/users/login?portalProfile=code-collective'))
  await expect(page.locator('html')).toHaveAttribute('data-portal-profile', 'code-collective')
})

test('a shared member link survives login, reload and sign-out', async ({ page }) => {
  await mockServices(page)
  await page.goto(portal(`/community?${profile}`))
  await expect(page.getByRole('heading', { name: 'Welcome to Baltimore MedTech' })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel(/^Password/).fill('medtech-test-password')
  await page.getByRole('button', { name: 'Member login', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your Baltimore MedTech community.' })).toBeVisible()
  await page.reload()
  await assertBrand(page)
  await page.getByRole('button', { name: 'Open user menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Baltimore MedTech' })).toBeVisible()
  await assertBrand(page)
})

test('an unavailable calendar leaves a useful MedTech member page', async ({ page }) => {
  await mockServices(page, true)
  await page.route('**/baltimore/upcoming_events.json', route => route.fulfill({ status: 503, body: 'Unavailable' }))
  await page.goto(portal(`/?${profile}`))
  await expect(page.getByRole('heading', { name: 'Your Baltimore MedTech community.' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Events could not be loaded')
  await expect(page.getByRole('link', { name: 'Full medical calendar' })).toHaveAttribute('href', 'https://medtech.social/calendar.html')
  await assertBrand(page)
})
