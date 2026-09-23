import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { renderEventPoster } from '../../../org-worker/src/eventPoster'

test.use({ video: 'off' })

const basePath = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').pathname.replace(/\/$/, '')
const portal = (path: string) => `${basePath}${path}`

type MockTenantOptions = {
  completeAppLogin?: boolean
  initiallyLoggedIn?: boolean
  mockEventChatRoutes?: boolean
}

const medtechEvent = {
  id: 'evt-medtech-hut',
  title: 'MedTech in the Hut',
  slug: 'medtech-in-the-hut',
  description: 'A Baltimore MedTech event.',
  starts_at: '2026-09-29T18:00:00-04:00',
  ends_at: '2026-09-29T20:00:00-04:00',
  location: 'Checkerspot Brewing',
  organization_name: 'Baltimore MedTech',
  host_org_name: 'Baltimore MedTech',
  host_org_id: 'org-medtech',
}

test('poster workflow previews formats, exports PNG and SVG, and opens print', async ({ page }, info) => {
  test.setTimeout(90000)
  await mockTenant(page)
  await page.addInitScript(() => {
    const open = window.open.bind(window)
    window.open = (...args: Parameters<typeof window.open>) => {
      const popup = open(...args)
      if (popup) popup.print = () => { popup.document.body.dataset.printed = 'true' }
      return popup
    }
  })
  await page.route('**/flyer.svg?**', async route => {
    const query = new URL(route.request().url()).searchParams
    const format = query.get('format') as 'letter' | 'letter-4up' | 'postcard' | 'social'
    const theme = query.get('theme') === 'dark' ? 'dark' : 'light'
    const svg = await renderEventPoster(medtechEvent, 'https://medtech.social/events/medtech-in-the-hut', format, { name: 'Baltimore MedTech' }, theme)
    await route.fulfill({ contentType: 'image/svg+xml', body: svg })
  })
  await page.goto(portal('/events/medtech-in-the-hut'))
  await page.getByRole('button', { name: 'Create poster', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Event poster', exact: true })
  await editor.getByRole('button', { name: 'Dark', exact: true }).click()
  for (const [label, width, height] of [['8.5 x 11', 2550, 3300], ['Letter 2 × 2', 2550, 3300], ['4 x 6', 1200, 1800], ['Social', 1200, 630]] as const) {
    await editor.getByRole('button', { name: label, exact: true }).click()
    await expect(editor.getByRole('img')).toHaveAttribute('alt', `MedTech in the Hut, ${label}, dark poster`)
    const pending = page.waitForEvent('download')
    await editor.getByRole('button', { name: 'PNG', exact: true }).click()
    const download = await pending
    const path = info.outputPath(download.suggestedFilename())
    await download.saveAs(path)
    const png = await readFile(path)
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height])
    const printing = page.waitForEvent('popup')
    await editor.getByRole('button', { name: 'Print', exact: true }).click()
    const popup = await printing
    await expect(popup.locator('body')).toHaveAttribute('data-printed', 'true')
    const pdf = await popup.pdf({ preferCSSPageSize: true, path: info.outputPath(`${download.suggestedFilename()}.pdf`) })
    const mediaBox = pdf.toString('latin1').match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)
    expect(mediaBox).not.toBeNull()
    const expected = label === '8.5 x 11' || label === 'Letter 2 × 2' ? [612, 792] : label === '4 x 6' ? [288, 432] : [864, 453.6]
    expect(Math.abs(Number(mediaBox![1]) - expected[0])).toBeLessThan(1)
    expect(Math.abs(Number(mediaBox![2]) - expected[1])).toBeLessThan(1)
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBe(1)
    await popup.close()
  }
  const vector = page.waitForEvent('download')
  await editor.getByRole('button', { name: 'SVG', exact: true }).click()
  expect((await vector).suggestedFilename()).toBe('medtech-in-the-hut-social-dark.svg')
})

test('poster failures offer retry and do not leave export buttons active', async ({ page }) => {
  await mockTenant(page)
  let failing = true
  await page.route('**/flyer.svg?**', async route => {
    if (failing) return route.fulfill({ status: 503, body: 'Unavailable' })
    return route.fulfill({ contentType: 'image/svg+xml', body: await renderEventPoster(medtechEvent, 'https://medtech.social/events/medtech-in-the-hut', 'letter', { name: 'Baltimore MedTech' }) })
  })
  await page.goto(portal('/events/medtech-in-the-hut'))
  await page.getByRole('button', { name: 'Create poster', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Event poster', exact: true })
  await expect(editor.getByRole('alert')).toContainText('Poster unavailable')
  await expect(editor.getByRole('button', { name: 'PNG', exact: true })).toBeDisabled()
  failing = false
  await editor.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(editor.getByRole('img')).toBeVisible()
  await expect(editor.getByRole('button', { name: 'PNG', exact: true })).toBeEnabled()
})

test('event gallery resolves stored images through the org API without rewriting external images', async ({ page }) => {
  await mockTenant(page);
  await page.route('**/api/org/api/network/events/public/medtech-in-the-hut', route => route.fulfill({ json: {
    ...medtechEvent,
    media: [
      { id: 'stored', url: '/api/network/events/public/medtech-in-the-hut/media/stored', label: '20260915_201444_extra_long_menu_photo_filename.jpg', alt: 'Menu photo', kind: 'image' },
      { id: 'external', url: 'https://images.test/event.png', label: 'External photo', alt: 'External photo', kind: 'image' },
    ],
  } }));
  await page.goto(portal('/events/medtech-in-the-hut'));
  const image = page.getByRole('img', { name: 'Menu photo', exact: true });
  await expect(image).toHaveAttribute('src', '/api/org/api/network/events/public/medtech-in-the-hut/media/stored');
  const labelFits = await image.locator('..').locator('strong').evaluate(label => label.scrollWidth <= label.parentElement!.clientWidth);
  expect(labelFits).toBe(true);
  await expect(page.getByRole('img', { name: 'External photo', exact: true })).toHaveAttribute('src', 'https://images.test/event.png');
  await page.getByRole('button', { name: 'Open Menu photo in gallery', exact: true }).click();
  const gallery = page.getByRole('dialog');
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('heading', { name: '20260915_201444_extra_long_menu_photo_filename.jpg', exact: true })).toBeVisible();
  await expect(gallery.getByRole('img', { name: 'Menu photo', exact: true })).toHaveAttribute('src', '/api/org/api/network/events/public/medtech-in-the-hut/media/stored');
  await expect(gallery.getByRole('link', { name: 'Open', exact: true })).toHaveAttribute('href', '/api/org/api/network/events/public/medtech-in-the-hut/media/stored');
  await gallery.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect(gallery.getByRole('heading', { name: 'External photo', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(gallery).toBeHidden();
});

async function mockTenant(page: Page, options: MockTenantOptions = {}) {
  let loggedIn = Boolean(options.initiallyLoggedIn)
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
        brand_image_path: '/images/baltimore-medtech-logo-square-v2.jpg',
        home_url: 'https://medtech.social/',
        member_home_path: '/chat',
        manifest_path: '/medtech.webmanifest',
        theme_color: '#061a26',
        home_kind: 'auth',
        home_org_slug: 'baltimore-medtech',
        home_primary_label: 'Join Baltimore MedTech',
        home_primary_href: '/users/login',
        home_secondary_label: 'Browse MedTech Events',
        home_secondary_href: '/org-events',
        public_base_url: 'https://medtech.social',
        canonical_path_prefix: '',
        feature_config: { externalCalendarUrl: 'https://medtech.social/calendar.html' },
      } })
    }
    if (path.endsWith('/admin/me')) return route.fulfill({ json: { is_sysadmin: false } })
    if (path.includes('/network/orgs/public/baltimore-medtech/events')) return route.fulfill({ json: [] })
    if (path.endsWith('/network/events/public/medtech-in-the-hut/chat')) {
      return route.fulfill({ json: { event_slug: 'medtech-in-the-hut', room_exists: true, room_name: 'Event comments' } })
    }
    if (path.endsWith('/network/events/public/medtech-in-the-hut')) return route.fulfill({ json: medtechEvent })
    if (path.endsWith('/network/events/evt-medtech-hut/attendance')) {
      return route.fulfill({ json: {
        event_id: 'evt-medtech-hut',
        count: 2,
        registered: false,
        attendees: [
          { user_id: 'user-public', slug: 'public-registrant', name: 'Public Registrant', photo_url: 'https://images.test/public.png', profile_public: true },
          { user_id: 'user-private', slug: 'private-registrant', name: 'Private Registrant', photo_url: 'https://images.test/private.png', profile_public: false },
        ],
      } })
    }
    return route.fulfill({ json: [] })
  })
  await page.route('**/pidp/**', async route => {
    const url = new URL(route.request().url())
    if (/\/auth\/(google|github)\/login$/.test(url.pathname) || url.pathname.endsWith('/app/login')) {
      if (options.completeAppLogin) loggedIn = true
      await route.fulfill({ status: 302, headers: { location: url.searchParams.get('next')! } })
      return
    }
    if (url.pathname.endsWith('/auth/session-token')) {
      await route.fulfill(loggedIn
        ? { json: { access_token: 'header.payload.signature' } }
        : { status: 401, json: {} })
      return
    }
    if (url.pathname.endsWith('/auth/me')) {
      await route.fulfill(loggedIn
        ? { json: { id: 'user-a', email: 'alice@example.test', full_name: 'Alice Example', identity_data: { display_name: 'Alice Example' } } }
        : { status: 401, json: {} })
      return
    }
    await route.fulfill({ status: 401, json: {} })
  })
  if (options.mockEventChatRoutes !== false) {
    await page.route('**/api/network/chat/event-room', route => {
      return route.fulfill({ json: { conversation: { id: 'conv-event', kind: 'event', title: 'Event comments', updated_at: '2026-09-10T12:00:00Z' } } })
    })
    await page.route('**/api/network/chat/conversations/conv-event/messages?afterSequence=0', route => {
      return route.fulfill({ json: { latest_sequence: 0, messages: [] } })
    })
  }
}

test('tenant domains use root-mounted canonical routes and assets', async ({ page }) => {
  await mockTenant(page)
  await page.goto(portal('/users/login'))

  await expect(page.locator('html')).toHaveAttribute('data-portal-profile', 'baltimore-medtech')
  await expect(page.locator('html')).toHaveAttribute('data-portal-tenant', 'baltimore-medtech')
  await expect(page.getByRole('heading', { name: 'Welcome to Baltimore MedTech' })).toBeVisible()
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/images\/baltimore-medtech-logo-square-v2\.jpg$/)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /\/medtech\.webmanifest$/)

  const providerUrl = new URL((await page.getByRole('link', { name: 'Continue with Google' }).getAttribute('href'))!, 'http://portal.test')
  const callback = new URL(providerUrl.searchParams.get('next')!)
  expect(callback.pathname).toBe('/auth/callback')
  expect(callback.searchParams.has('portalProfile')).toBe(false)
  expect(callback.searchParams.get('next')).toBe('/chat')
})

test('tenant legacy community aliases redirect to canonical tenant routes', async ({ page }) => {
  await mockTenant(page)

  await page.goto(portal('/community?portalProfile=baltimore-medtech'))
  await expect(page).toHaveURL(/\/orgs\/baltimore-medtech$/)

  await page.goto(portal('/medtech-events'))
  await expect(page).toHaveURL(/\/org-events$/)
})

test('tenant brand guide uses the active organization identity', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          ;(window as unknown as { __copiedBrandColor?: string }).__copiedBrandColor = value
        },
      },
    })
  })
  await mockTenant(page)
  await page.goto(portal('/branding'))

  await expect(page.getByRole('heading', { name: 'Baltimore MedTech', exact: true })).toBeVisible()
  await expect(page.getByText('Health x Medicine x Biotech', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.tenant-brand-lockup strong')).toHaveCSS('color', 'rgb(23, 32, 51)')
  await expect(page.getByRole('img', { name: 'Baltimore MedTech primary logo' })).toHaveAttribute('src', /\/images\/baltimore-medtech-logo-square-v2\.jpg$/)
  await expect(page.getByText('#0f6f8f', { exact: true })).toBeVisible()
  await expect(page.getByText('#061a26', { exact: true })).toBeVisible()
  await expect(page.getByText('#FFFFFF', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Copy Accent color #0f6f8f' }).click()
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __copiedBrandColor?: string }).__copiedBrandColor)).toBe('#0f6f8f')

  await page.goto(portal('/branding.html'))
  await expect(page).toHaveURL(/\/branding$/)
})

test('tenant event auth actions return to the same root-mounted event', async ({ page }) => {
  await mockTenant(page, { completeAppLogin: true })
  await page.goto(portal('/events/medtech-in-the-hut'))

  await expect(page.getByRole('heading', { name: 'MedTech in the Hut' })).toBeVisible()
  await page.getByRole('link', { name: 'Login to Comment' }).click()

  await expect(page).toHaveURL(/\/auth\/callback\?next=%2Fevents%2Fmedtech-in-the-hut/)
  await expect(page).toHaveURL(/\/events\/medtech-in-the-hut$/)
  await expect(page.getByRole('heading', { name: 'MedTech in the Hut' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/404|not found/i)
})

test('tenant event comments use the chat API for room, comments, replies, and reactions', async ({ page }) => {
  const rootText = 'Excited to meet other medtech builders.'
  const replyText = 'Saving a seat near the front.'
  const chatRequests: string[] = []

  await mockTenant(page, { initiallyLoggedIn: true, mockEventChatRoutes: false })
  await page.route('**/api/chat/api/network/chat/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    chatRequests.push(`${request.method()} ${url.pathname}${url.search}`)

    if (url.pathname.endsWith('/api/network/chat/event-room')) {
      const payload = request.postDataJSON() as { event_id?: string; title?: string; org_id?: string | null }
      expect(payload).toEqual({
        event_id: 'evt-medtech-hut',
        title: 'Event comments',
        org_id: 'org-medtech',
      })
      return route.fulfill({ json: { conversation: { id: 'conv-event', kind: 'event_room', event_id: 'evt-medtech-hut', title: 'Event comments', updated_at: '2026-09-10T12:00:00Z' } } })
    }

    if (url.pathname.endsWith('/api/network/chat/conversations/conv-event/messages') && request.method() === 'GET') {
      return route.fulfill({ json: { latest_sequence: 0, messages: [] } })
    }

    if (url.pathname.endsWith('/api/network/chat/conversations/conv-event/messages') && request.method() === 'POST') {
      const payload = request.postDataJSON() as { body?: string; reply_to_message_id?: string; thread_root_message_id?: string }
      const isReply = payload.thread_root_message_id === 'root-message'
      return route.fulfill({
        status: 201,
        json: {
          message: {
            id: isReply ? 'reply-message' : 'root-message',
            conversation_id: 'conv-event',
            sender_user_id: 'user-a',
            sender_name: 'Alice Example',
            sender_avatar_url: null,
            client_message_id: isReply ? 'client-reply' : 'client-root',
            body: payload.body,
            sequence: isReply ? 2 : 1,
            message_type: 'text',
            reply_to_message_id: payload.reply_to_message_id || null,
            thread_root_message_id: payload.thread_root_message_id || null,
            created_at: isReply ? '2026-09-10T12:02:00Z' : '2026-09-10T12:01:00Z',
            edited_at: null,
            deleted_at: null,
            moderation_state: 'visible',
            reactions: [],
          },
        },
      })
    }

    if (url.pathname.endsWith('/api/network/chat/conversations/conv-event/messages/root-message/reactions')) {
      return route.fulfill({
        json: {
          reactions: [{
            key: '👍',
            count: 1,
            reacted: true,
            users: [{ user_id: 'user-a', user_name: 'Alice Example', avatar_url: null, created_at: '2026-09-10T12:03:00Z' }],
          }],
        },
      })
    }

    return route.fulfill({ status: 404, json: { detail: 'Unhandled event chat route' } })
  })

  await page.goto(portal('/events/medtech-in-the-hut'))

  await expect(page.getByRole('heading', { name: 'MedTech in the Hut' })).toBeVisible()
  await expect(page.locator('.public-event-attendance-count strong')).toHaveText('2 coming')
  await expect(page.getByPlaceholder('Add a comment...')).toBeEnabled()

  await page.getByPlaceholder('Add a comment...').fill(rootText)
  await page.getByRole('button', { name: 'Post Comment' }).click()
  const rootComment = page.locator('.public-event-comment').filter({ hasText: rootText }).first()
  await expect(rootComment).toBeVisible()

  await rootComment.getByRole('button', { name: 'Reply' }).click()
  await page.getByPlaceholder('Write a reply...').fill(replyText)
  await page.getByRole('button', { name: 'Post Reply' }).click()
  await expect(rootComment.locator('.public-event-comment-reply').filter({ hasText: replyText })).toBeVisible()

  await rootComment.locator('summary').filter({ hasText: 'React' }).first().click()
  await rootComment.getByRole('button', { name: 'React with 👍' }).first().click()
  await expect(rootComment.getByRole('button', { name: /Remove 👍/ })).toContainText('👍 1')
  await expect(page.locator('body')).not.toContainText('Chat request failed (501)')

  expect(chatRequests).toEqual(expect.arrayContaining([
    'POST /api/chat/api/network/chat/event-room',
    'GET /api/chat/api/network/chat/conversations/conv-event/messages?afterSequence=0',
    'POST /api/chat/api/network/chat/conversations/conv-event/messages',
    'POST /api/chat/api/network/chat/conversations/conv-event/messages/root-message/reactions',
  ]))
})

test('tenant event guest list is compact publicly and explorable when logged in', async ({ page }) => {
  await mockTenant(page, { initiallyLoggedIn: true })
  await page.goto(portal('/events/medtech-in-the-hut'))

  await expect(page.locator('.public-event-registrant')).toHaveCount(2)
  await expect(page.locator('.public-event-registration')).not.toContainText('Private Registrant')
  await page.getByRole('button', { name: /2 coming/ }).click()
  const dialog = page.getByRole('dialog', { name: /2 coming/ })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Public Registrant', exact: true })).toHaveAttribute('href', '/users/public-registrant')
  await expect(dialog.getByRole('link', { name: 'Private Registrant', exact: true })).toHaveAttribute('href', '/users/private-registrant')

  const privateMessage = dialog.locator('.public-event-guest-list-item').filter({ hasText: 'Private Registrant' }).getByRole('link', { name: 'Message' })
  await expect(privateMessage).toBeVisible()
  const messageUrl = new URL((await privateMessage.getAttribute('href'))!, 'https://medtech.social')
  expect(messageUrl.pathname).toBe('/chat')
  expect(messageUrl.searchParams.get('start')).toBe('dm')
  expect(messageUrl.searchParams.get('userId')).toBe('user-private')
  expect(messageUrl.searchParams.get('name')).toBe('Private Registrant')
  expect(messageUrl.toString()).not.toContain('@')
})

test('tenant event location opens Google Maps and copies the address', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          ;(window as unknown as { __copiedAddress?: string }).__copiedAddress = value
        },
      },
    })
  })
  await mockTenant(page, { initiallyLoggedIn: true })
  await page.goto(portal('/events/medtech-in-the-hut'))

  const mapsLink = page.getByRole('link', { name: /Open in Google Maps/i })
  await expect(mapsLink).toBeVisible()
  await expect(mapsLink).toHaveAttribute('href', /google\.com\/maps\/search/)
  await expect(page.locator('.public-event-map-frame iframe')).toHaveAttribute('src', /google\.com\/maps/)

  await page.getByRole('button', { name: 'Copy Address' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __copiedAddress?: string }).__copiedAddress)).toBe('Checkerspot Brewing')
})

test('tenant header login preserves the current event route', async ({ page }) => {
  await mockTenant(page, { completeAppLogin: true })
  await page.goto(portal('/events/medtech-in-the-hut'))

  await page.getByRole('link', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/users\/login\?next=%2Fevents%2Fmedtech-in-the-hut$/)
  await page.getByRole('link', { name: 'Continue with Code Collective' }).click()

  await expect(page).toHaveURL(/\/events\/medtech-in-the-hut$/)
  await expect(page.getByRole('heading', { name: 'MedTech in the Hut' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/404|not found/i)
})
