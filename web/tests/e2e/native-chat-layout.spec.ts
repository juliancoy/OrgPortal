import { expect, test } from '@playwright/test'

const conversation = {
  id: 'room-1',
  kind: 'dm',
  updated_at: '2026-08-07T12:00:00.000Z',
  last_message_at: '2026-08-07T12:00:00.000Z',
  unread_count: 0,
  last_message: {
    body: 'The new chat layout is much easier to scan.',
    sender_user_id: 'other-user',
    created_at: '2026-08-07T12:00:00.000Z',
    sequence: 2,
  },
  members: [
    { user_id: 'test-user-1', user_name: 'Mobile Tester', role: 'member', state: 'active' },
    { user_id: 'other-user', user_name: 'Julian Coy', role: 'member', state: 'active' },
  ],
}

const messages = [
  {
    id: 'message-1',
    conversation_id: 'room-1',
    sender_user_id: 'other-user',
    sender_name: 'Julian Coy',
    body: 'Hello — this is an incoming message with enough text to exercise wrapping.',
    sequence: 1,
    message_type: 'text',
    created_at: '2026-08-07T11:59:00.000Z',
  },
  {
    id: 'message-2',
    conversation_id: 'room-1',
    sender_user_id: 'test-user-1',
    sender_name: 'Mobile Tester',
    body: 'This reply should remain aligned to the right.',
    sequence: 2,
    message_type: 'text',
    created_at: '2026-08-07T12:00:00.000Z',
  },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      static OPEN = 1
      readyState = 0
      constructor() {
        super()
        window.setTimeout(() => {
          this.readyState = MockWebSocket.OPEN
          this.dispatchEvent(new Event('open'))
        }, 0)
      }
      send() {}
      close() {
        this.readyState = 3
        this.dispatchEvent(new CloseEvent('close'))
      }
    }
    class MockPeerConnection extends EventTarget {
      connectionState = 'new'
      remoteDescription = null
      onicecandidate = null
      ontrack = null
      onconnectionstatechange = null
      addTrack() {}
      getSenders() { return [] }
      async createOffer() { return { type: 'offer', sdp: 'v=0' } }
      async setLocalDescription() {}
      close() {}
    }
    Object.defineProperty(window, 'WebSocket', { value: MockWebSocket })
    Object.defineProperty(window, 'RTCPeerConnection', { value: MockPeerConnection })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => new MediaStream(),
        getDisplayMedia: async () => new MediaStream(),
      },
    })
  })
  await page.route('**/auth/session-token', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'test-token' }) }),
  )
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-1',
        email: 'mobile@test.org',
        full_name: 'Mobile Tester',
        avatar_url: null,
        identity_data: null,
      }),
    }),
  )
  await page.route('**/api/org/admin/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_sysadmin: false }) }),
  )
  await page.route('**/api/org/api/network/users?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route('https://chat-codecollective.jcloiacon.workers.dev/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/api/network/chat/conversations')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [conversation] }) })
      return
    }
    if (url.pathname.endsWith('/messages')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ latest_sequence: 2, messages }) })
      return
    }
    if (url.pathname.endsWith('/sync')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversation_id: 'room-1', latest_sequence: 2, messages: [] }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
})

test('native chat has a readable desktop conversation layout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Desktop layout assertion')
  await page.goto('/chat/room-1')
  await expect(page.locator('.portal-chat-message')).toHaveCount(2)

  const sidebar = await page.locator('.native-chat-sidebar').boundingBox()
  const textarea = await page.locator('.portal-chat-composer textarea').boundingBox()
  const send = await page.locator('.portal-chat-composer .btn-primary').boundingBox()
  const incoming = await page.locator('.portal-chat-message').first().boundingBox()
  const outgoing = await page.locator('.portal-chat-message.mine').boundingBox()

  expect(sidebar?.width || 0).toBeGreaterThanOrEqual(220)
  expect(Math.abs((textarea?.y || 0) + (textarea?.height || 0) - ((send?.y || 0) + (send?.height || 0)))).toBeLessThanOrEqual(4)
  expect(send?.width || 999).toBeLessThanOrEqual(140)
  expect(textarea?.width || 0).toBeGreaterThan(send?.width || 0)
  expect(outgoing?.x || 0).toBeGreaterThan(incoming?.x || 0)
  await expect(page.locator('.portal-chat-message').first().locator('.portal-chat-message-avatar')).toHaveCount(1)
})

test('native direct messages expose the video call workspace', async ({ page }) => {
  await page.goto('/chat/room-1')
  const callButton = page.getByRole('button', { name: 'Video call' })
  await expect(callButton).toBeEnabled()
  await callButton.click()
  await expect(page.getByRole('dialog', { name: 'Julian Coy video call' })).toBeVisible()
  await expect(page.getByText('Private video call')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Camera off' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share screen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible()
})

test('native chat stays aligned and contained on mobile', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile layout assertion')
  await page.goto('/chat/room-1')
  await expect(page.locator('.portal-chat-message')).toHaveCount(2)

  const incoming = await page.locator('.portal-chat-message').first().boundingBox()
  const outgoing = await page.locator('.portal-chat-message.mine').boundingBox()
  const composer = await page.locator('.portal-chat-composer').boundingBox()
  const viewport = page.viewportSize()

  expect(outgoing?.x || 0).toBeGreaterThan(incoming?.x || 0)
  expect((composer?.x || 0) + (composer?.width || 0)).toBeLessThanOrEqual(viewport?.width || 0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('native chat remains usable across browser zoom levels', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Desktop zoom matrix')
  await page.goto('/chat/room-1')
  await expect(page.locator('.portal-chat-message')).toHaveCount(2)

  for (const zoom of [50, 67, 80, 100, 125, 150, 175, 200, 250]) {
    await page.evaluate((value) => {
      document.documentElement.style.zoom = `${value}%`
    }, zoom)
    await page.waitForTimeout(50)

    const layout = await page.evaluate(() => {
      const composer = document.querySelector<HTMLElement>('.portal-chat-composer')
      const textarea = document.querySelector<HTMLElement>('.portal-chat-composer textarea')
      const send = document.querySelector<HTMLElement>('.portal-chat-composer .btn-primary')
      const messages = [...document.querySelectorAll<HTMLElement>('.portal-chat-message')]
      const viewportWidth = document.documentElement.clientWidth
      const rect = (element: HTMLElement | null) => element?.getBoundingClientRect() || null
      return {
        overflow: document.documentElement.scrollWidth - viewportWidth,
        viewportWidth,
        composer: rect(composer),
        textarea: rect(textarea),
        send: rect(send),
        messages: messages.map((message) => rect(message)),
      }
    })

    expect(layout.overflow, `horizontal overflow at ${zoom}% zoom`).toBeLessThanOrEqual(1)
    expect(layout.composer?.right || Infinity, `composer containment at ${zoom}% zoom`).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.textarea?.width || 0, `textarea width at ${zoom}% zoom`).toBeGreaterThan(80)
    expect(layout.send?.width || 0, `send target width at ${zoom}% zoom`).toBeGreaterThanOrEqual(44)
    for (const message of layout.messages) {
      expect(message?.width || 0, `message width at ${zoom}% zoom`).toBeGreaterThan(40)
      expect(message?.right || Infinity, `message containment at ${zoom}% zoom`).toBeLessThanOrEqual(layout.viewportWidth + 1)
    }
  }
})
