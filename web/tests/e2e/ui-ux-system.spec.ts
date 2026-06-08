import { expect, test, type Page, type Route } from '@playwright/test'

const authUser = {
  id: 'test-user-1',
  email: 'mobile@test.org',
  full_name: 'Mobile Tester',
  avatar_url: 'https://assets.test/mobile-tester.png',
  identity_data: {
    display_name: 'Mobile Tester',
    bio: 'Testing public identity and chat flows.',
    avatar_url: 'https://assets.test/mobile-tester.png',
    first_name: 'Mobile',
    last_name: 'Tester',
  },
}

const contactPage = {
  user_id: 'test-user-1',
  user_name: 'Mobile Tester',
  slug: 'mobile-tester',
  enabled: true,
  headline: 'Civic systems tester',
  bio: 'Testing public identity and chat flows.',
  photo_url: 'https://assets.test/mobile-tester.png',
  email_public: 'mobile@test.org',
  phone_public: '+15551234567',
  website_url: 'https://codecollective.us',
  linkedin_url: 'https://linkedin.test/mobile',
  github_url: 'https://github.test/mobile',
  x_url: 'https://x.test/mobile',
  links: [
    { label: 'Calendar', url: 'https://calendar.test/mobile' },
    { label: 'Office Hours', url: 'https://meet.test/mobile' },
  ],
  public_url: 'http://127.0.0.1:4173/users/mobile-tester',
}

const otherContactPage = {
  ...contactPage,
  user_id: 'test-user-2',
  user_name: 'Jordan Contact',
  slug: 'jordan-contact',
  headline: 'Community organizer',
  email_public: 'jordan@test.org',
  public_url: 'http://127.0.0.1:4173/users/jordan-contact',
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockCommon(page: Page) {
  await page.route('**/assets.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
  })

  await page.route('**/auth/session-token', async (route) => {
    await fulfillJson(route, { access_token: 'header.payload.signature' })
  })

  await page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}')
      await fulfillJson(route, {
        id: authUser.id,
        email: authUser.email,
        full_name: body.full_name || authUser.full_name,
        avatar_url: body.avatar_url || authUser.avatar_url,
        identity_data: body,
      })
      return
    }
    await fulfillJson(route, authUser)
  })

  await page.route('**/api/org/admin/me', async (route) => {
    await fulfillJson(route, { is_sysadmin: false })
  })

  await page.route('**/api/org/api/network/orgs?mine=true**', async (route) => {
    await fulfillJson(route, [
      { id: 'org-1', name: 'Code Collective', slug: 'code-collective', my_role: 'admin', claimed_by_user_id: authUser.id },
    ])
  })

  await page.route('**/api/org/api/network/orgs/public/**', async (route) => {
    await fulfillJson(route, { is_contested: false, pending_claim_requests_count: 0 })
  })

  await page.route('**/api/org/api/network/users/public/mobile-tester/events**', async (route) => {
    await fulfillJson(route, [])
  })

  await page.route('**/api/org/api/network/users/public/jordan-contact/events**', async (route) => {
    await fulfillJson(route, [])
  })

  await page.route('**/api/org/api/network/users/public/mobile-tester', async (route) => {
    await fulfillJson(route, contactPage)
  })

  await page.route('**/api/org/api/network/users/public/jordan-contact', async (route) => {
    await fulfillJson(route, otherContactPage)
  })

  await page.route('**/api/org/api/network/contact/me', async (route) => {
    if (route.request().method() === 'PUT') {
      await fulfillJson(route, { ...contactPage, ...(JSON.parse(route.request().postData() || '{}') as object) })
      return
    }
    await fulfillJson(route, contactPage)
  })
}

async function mockNativeChat(page: Page, options: { failSend?: boolean; unauthorized?: boolean } = {}) {
  const conversation = {
    id: 'dm-1',
    kind: 'dm',
    title: null,
    updated_at: '2026-06-07T20:00:00.000Z',
    last_message_at: '2026-06-07T20:00:00.000Z',
    unread_count: 0,
    members: [
      { user_id: authUser.id, user_name: 'Mobile Tester', role: 'member', state: 'active' },
      { user_id: 'test-user-2', user_name: 'Jordan Contact', role: 'member', state: 'active' },
    ],
  }
  const initialMessages = [
    {
      id: 'msg-1',
      conversation_id: 'dm-1',
      sender_user_id: 'test-user-2',
      sender_name: 'Jordan Contact',
      client_message_id: 'seed-1',
      body: 'Existing hello from Jordan',
      message_type: 'text',
      created_at: '2026-06-07T20:00:00.000Z',
      sequence: 1,
    },
  ]

  await page.route('**/api/network/chat/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (options.unauthorized) {
      await fulfillJson(route, { detail: 'Invalid credentials' }, 401)
      return
    }

    if (url.pathname.endsWith('/api/network/chat/conversations') && request.method() === 'GET') {
      await fulfillJson(route, { conversations: [conversation] })
      return
    }

    if (url.pathname.endsWith('/api/network/chat/dm') && request.method() === 'POST') {
      await fulfillJson(route, { conversation })
      return
    }

    if (url.pathname.endsWith('/api/network/chat/conversations/dm-1/messages') && request.method() === 'GET') {
      await fulfillJson(route, { latest_sequence: 1, messages: initialMessages })
      return
    }

    if (url.pathname.endsWith('/api/network/chat/conversations/dm-1/messages') && request.method() === 'POST') {
      if (options.failSend) {
        await fulfillJson(route, { detail: 'Message service unavailable' }, 503)
        return
      }
      const body = JSON.parse(request.postData() || '{}')
      await fulfillJson(route, {
        message: {
          id: 'msg-2',
          conversation_id: 'dm-1',
          sender_user_id: authUser.id,
          sender_name: 'Mobile Tester',
          client_message_id: body.client_message_id,
          body: body.body,
          message_type: 'text',
          created_at: '2026-06-07T20:01:00.000Z',
          sequence: 2,
        },
      })
      return
    }

    if (url.pathname.endsWith('/api/network/chat/conversations/dm-1/sync')) {
      await fulfillJson(route, { conversation_id: 'dm-1', latest_sequence: 1, messages: [], receipts: [] })
      return
    }

    if (url.pathname.endsWith('/api/network/chat/conversations/dm-1/read')) {
      await fulfillJson(route, { ok: true })
      return
    }

    await fulfillJson(route, { detail: 'Unhandled chat mock route' }, 404)
  })
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, delta: doc.scrollWidth - doc.clientWidth }
  })
  expect(overflow.delta, `horizontal overflow: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(1)
}

async function expectInteractiveElementsHaveNames(page: Page) {
  const unnamed = await page.evaluate(() => {
    function textAlternative(element: Element): string {
      const aria = element.getAttribute('aria-label') || element.getAttribute('title') || ''
      const text = element.textContent || ''
      const labelledBy = element.getAttribute('aria-labelledby')
      const labelledText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent || '')
            .join(' ')
        : ''
      return `${aria} ${text} ${labelledText}`.trim()
    }

    return Array.from(document.querySelectorAll('a, button, input, textarea, select'))
      .filter((element) => {
        if (element.hasAttribute('disabled')) return false
        if (element instanceof HTMLInputElement && element.type === 'hidden') return false
        if (element instanceof HTMLInputElement) {
          const label = element.labels?.[0]?.textContent || ''
          return !`${textAlternative(element)} ${label} ${element.placeholder || ''}`.trim()
        }
        if (element instanceof HTMLTextAreaElement) {
          const label = element.labels?.[0]?.textContent || ''
          return !`${textAlternative(element)} ${label} ${element.placeholder || ''}`.trim()
        }
        return !textAlternative(element)
      })
      .map((element) => element.outerHTML.slice(0, 180))
  })

  expect(unnamed).toEqual([])
}

test.describe('Code Collective UI and UX system coverage', () => {
  test.beforeEach(async ({ page }) => {
    await mockCommon(page)
  })

  test('authenticated shell uses the stored profile image and exposes stable primary navigation', async ({ page }) => {
    await page.goto('/')

    const header = page.locator('.portal-header')
    await expect(header).toBeVisible()
    await expect(header.getByAltText('Code Collective')).toBeVisible()
    await expect(page.locator('.portal-user-trigger img')).toHaveAttribute('src', authUser.avatar_url)
    await expect(page.getByRole('link', { name: /^ID$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Chat$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /log in/i })).toHaveCount(0)

    await page.getByRole('link', { name: /^ID$/ }).click()
    await expect(page).toHaveURL(/\/id$/)
  })

  test('social login buttons route through PIdP OAuth instead of the legacy org endpoint', async ({ page }) => {
    await page.goto('/users/login')

    await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      /\/pidp\/auth\/google\/login\?/,
    )
    await expect(page.getByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
      'href',
      /\/pidp\/auth\/github\/login\?/,
    )
    await expect(page.getByRole('link', { name: 'Continue with Google' })).not.toHaveAttribute('href', /\/api\/org\/auth\/social/)
  })

  test('legacy constituent dashboard OAuth returns land on the user dashboard', async ({ page }) => {
    await page.goto('/constituent/dashboard#token=header.payload.signature&token_type=bearer')

    await expect(page).toHaveURL(/\/users\/dashboard$/)
    await expect(page.getByRole('heading', { name: /your voice/i })).toBeVisible()
    await expect(page.getByText(/page not found/i)).toHaveCount(0)
  })

  test('public ID page hides the app header, exposes inbox and owner edit actions, and remains responsive', async ({ page }) => {
    await page.goto('/users/mobile-tester')

    await expect(page.locator('.portal-header')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Mobile Tester' })).toBeVisible()
    await expect(page.getByRole('link', { name: /message mobile tester/i })).toHaveAttribute('href', /\/chat\?start=dm&user=mobile-tester/)
    await expect(page.getByRole('link', { name: 'Edit Profile' })).toHaveAttribute('href', '/contact-settings')
    const contactDownload = page.getByRole('button', { name: /download contact/i })
    await expect(contactDownload).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await contactDownload.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('mobile-tester.vcf')
    await expect(page.getByLabel('QR code for public profile').locator('svg')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('legacy contact public URLs redirect to the canonical users URL', async ({ page }) => {
    await page.goto('/contact/mobile-tester')

    await expect(page).toHaveURL(/\/users\/mobile-tester$/)
    await expect(page.getByRole('heading', { name: 'Mobile Tester' })).toBeVisible()
    await expect(page.getByText(/\/contact\/mobile-tester/)).toHaveCount(0)
  })

  test('private ID page renders link-tree contact data, a real QR SVG, a vCard download, and edit link', async ({ page }) => {
    await page.goto('/id')

    await expect(page.getByRole('heading', { name: 'Mobile Tester' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Email/ })).toHaveAttribute('href', 'mailto:mobile@test.org')
    await expect(page.getByRole('link', { name: /Phone/ })).toHaveAttribute('href', 'tel:+15551234567')
    await expect(page.getByRole('link', { name: /Calendar/ })).toHaveAttribute('href', 'https://calendar.test/mobile')

    const qrSvg = page.getByLabel('QR code for this ID').locator('svg')
    await expect(qrSvg).toBeVisible()
    const qrMarkupLength = await qrSvg.evaluate((node) => node.outerHTML.length)
    expect(qrMarkupLength).toBeGreaterThan(1000)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download vCard' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('mobile-tester.vcf')

    await expect(page.getByRole('link', { name: 'Edit ID' })).toHaveAttribute('href', '/contact-settings')
    await expectNoHorizontalOverflow(page)
  })

  test('profile editing saves OAuth-derived profile data and does not expose a raw profile-image URL field', async ({ page }) => {
    let savedProfile: Record<string, unknown> | null = null
    let savedContact: Record<string, unknown> | null = null

    await page.route('**/auth/me', async (route) => {
      if (route.request().method() === 'PUT') {
        savedProfile = JSON.parse(route.request().postData() || '{}')
        await fulfillJson(route, { ...authUser, full_name: savedProfile.full_name, identity_data: savedProfile })
        return
      }
      await fulfillJson(route, authUser)
    })
    await page.route('**/api/org/api/network/contact/me', async (route) => {
      if (route.request().method() === 'PUT') {
        savedContact = JSON.parse(route.request().postData() || '{}')
        await fulfillJson(route, { ...contactPage, ...savedContact })
        return
      }
      await fulfillJson(route, contactPage)
    })

    await page.goto('/users/profile')
    await expect(page.getByAltText('Profile preview')).toHaveAttribute('src', authUser.avatar_url)
    await expect(page.getByLabel(/profile image url/i)).toHaveCount(0)
    await expect(page.getByLabel(/profile photo url/i)).toHaveCount(0)

    await page.getByLabel('Display name').fill('Updated Tester')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByRole('status')).toContainText('Profile saved.')

    expect(savedProfile?.display_name).toBe('Updated Tester')
    expect(savedProfile?.avatar_url).toBe(authUser.avatar_url)
    expect(savedContact?.photo_url).toBe(authUser.avatar_url)
  })

  test('native chat opens a direct message, sends optimistically, and confirms the canonical server message', async ({ page }) => {
    await mockNativeChat(page)
    await page.goto('/chat?start=dm&user=jordan-contact')

    await expect(page).toHaveURL(/\/chat\/dm-1$/)
    await expect(page.getByRole('heading', { name: 'Jordan Contact' })).toBeVisible()
    await expect(page.getByText('Existing hello from Jordan')).toBeVisible()

    await page.getByPlaceholder('Write a message').fill('Hello from Playwright')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('Hello from Playwright')).toBeVisible()
    await expect(page.getByText('#2')).toBeVisible()
    await expect(page.getByText('Sending...')).toHaveCount(0)
  })

  test('native chat shows unauthorized and failed-send error states', async ({ page }) => {
    await mockNativeChat(page, { unauthorized: true })
    await page.goto('/chat')
    await expect(page.getByText('Invalid credentials')).toBeVisible()

    await page.unroute('**/api/network/chat/**')
    await mockNativeChat(page, { failSend: true })
    await page.goto('/chat/dm-1')
    await expect(page.getByText('Existing hello from Jordan')).toBeVisible()

    await page.getByPlaceholder('Write a message').fill('This send should fail')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('This send should fail')).toBeVisible()
    await expect(page.getByText('Message service unavailable')).toBeVisible()
    await expect(page.getByText('Failed. Retry by sending again.')).toBeVisible()
  })

  test('core routes avoid horizontal overflow and keep interactive controls accessible', async ({ page }) => {
    await mockNativeChat(page)
    for (const route of ['/id', '/users/mobile-tester', '/users/profile', '/chat/dm-1']) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expectNoHorizontalOverflow(page)
      await expectInteractiveElementsHaveNames(page)
    }
  })

  test('mocked core routes render within the UI performance budget', async ({ page }) => {
    await mockNativeChat(page)
    const startedAt = Date.now()
    await page.goto('/chat/dm-1')
    await expect(page.getByText('Existing hello from Jordan')).toBeVisible()
    expect(Date.now() - startedAt).toBeLessThan(2500)
  })
})
