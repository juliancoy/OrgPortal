import { expect, test, type Page, type Route } from '@playwright/test'

const authUser = { id: 'member-current', email: 'member@example.test', full_name: 'Current Member' }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockCalendarMember(page: Page) {
  let googleCalendar = {
    connected: true,
    google_email: 'member@gmail.test',
    calendar_id: 'primary',
    sync_busy: true,
    updated_at: '2026-08-11T12:00:00.000Z',
  }
  let microsoftCalendar = {
    connected: false,
    microsoft_email: null,
    calendar_id: null,
    updated_at: null,
  }

  const upcomingGoogleEvents = {
    connected: true,
    calendar_id: 'primary',
    events: [
      {
        id: 'google-event-1',
        summary: 'Existing Google meeting',
        description: 'Already on calendar',
        location: 'Online',
        html_link: 'https://calendar.google.com/calendar/event?eid=test',
        status: 'confirmed',
        starts_at: '2026-08-12T15:00:00.000Z',
        ends_at: '2026-08-12T16:00:00.000Z',
      },
    ],
  }

  await page.route('**/api/org/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/api/network/events/public?')) {
      return json(route, [
        {
          id: 'portal-event-1',
          title: 'Portal Town Hall',
          slug: 'portal-town-hall',
          description: 'Open member event',
          starts_at: '2026-08-12T18:00:00.000Z',
          ends_at: '2026-08-12T19:00:00.000Z',
          location: 'Union Hall',
        },
      ])
    }
    if (url.includes('/api/network/events/portal-event-1/attendance')) {
      return json(route, { ok: true, message: 'Attendance recorded.' })
    }
    return json(route, {})
  })
  await page.route('**/auth/session-token', (route) => json(route, { access_token: 'header.payload.signature' }))
  await page.route('**/auth/me', (route) => json(route, authUser))
  await page.route('**/api/org/admin/me', (route) => json(route, { is_sysadmin: false }))
  await page.route('**/auth/google-calendar/events?**', (route) => json(route, upcomingGoogleEvents))
  await page.route('**/auth/microsoft-calendar/events?**', (route) => json(route, { connected: false, calendar_id: null, events: [] }))
  await page.route('**/auth/microsoft-calendar/events', async (route) => json(route, { connected: false, event_id: null, web_link: null }))
  await page.route('**/auth/google-calendar/events', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({
      external_event_id: 'portal-event:portal-event-1',
      summary: 'Portal Town Hall',
      starts_at: '2026-08-12T18:00:00.000Z',
      ends_at: '2026-08-12T19:00:00.000Z',
      location: 'Union Hall',
    })
    return json(route, { connected: true, event_id: 'google-added-1', html_link: 'https://calendar.google.com/calendar/event?eid=added' })
  })
  await page.route('**/auth/google-calendar', async (route) => {
    if (route.request().method() === 'GET') return json(route, googleCalendar)
    if (route.request().method() === 'DELETE') {
      googleCalendar = { ...googleCalendar, connected: false, google_email: null, calendar_id: null, sync_busy: false, updated_at: '2026-08-11T12:30:00.000Z' }
      return json(route, { disconnected: true })
    }
    return route.fallback()
  })
  await page.route('**/auth/microsoft-calendar', async (route) => {
    if (route.request().method() === 'GET') return json(route, microsoftCalendar)
    if (route.request().method() === 'DELETE') {
      microsoftCalendar = { ...microsoftCalendar, connected: false, microsoft_email: null, calendar_id: null, updated_at: '2026-08-11T12:30:00.000Z' }
      return json(route, { disconnected: true })
    }
    return route.fallback()
  })
}

async function mockMicrosoftCalendarMember(page: Page) {
  const microsoftCalendar = {
    connected: true,
    microsoft_email: 'member@outlook.test',
    calendar_id: 'primary',
    updated_at: '2026-08-11T12:05:00.000Z',
  }

  const upcomingMicrosoftEvents = {
    connected: true,
    calendar_id: 'primary',
    events: [
      {
        id: 'ms-event-1',
        summary: 'Existing Outlook meeting',
        description: 'Already on Microsoft calendar',
        location: 'Teams',
        web_link: 'https://outlook.office.com/calendar/item/test',
        starts_at: '2026-08-12T17:00:00.000Z',
        ends_at: '2026-08-12T17:30:00.000Z',
      },
    ],
  }

  await page.route('**/api/org/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/api/network/events/public?')) {
      return json(route, [
        {
          id: 'portal-event-2',
          title: 'Microsoft Town Hall',
          slug: 'microsoft-town-hall',
          description: 'Outlook-connected member event',
          starts_at: '2026-08-13T18:00:00.000Z',
          ends_at: '2026-08-13T19:00:00.000Z',
          location: 'Assembly Hall',
        },
      ])
    }
    if (url.includes('/api/network/events/portal-event-2/attendance')) {
      return json(route, { ok: true, message: 'Attendance recorded.' })
    }
    return json(route, {})
  })
  await page.route('**/auth/session-token', (route) => json(route, { access_token: 'header.payload.signature' }))
  await page.route('**/auth/me', (route) => json(route, authUser))
  await page.route('**/api/org/admin/me', (route) => json(route, { is_sysadmin: false }))
  await page.route('**/auth/google-calendar/events?**', (route) => json(route, { connected: false, calendar_id: null, events: [] }))
  await page.route('**/auth/google-calendar/events', async (route) => json(route, { connected: false, event_id: null, html_link: null }))
  await page.route('**/auth/google-calendar', async (route) => json(route, { connected: false, google_email: null, calendar_id: null, sync_busy: false, updated_at: null }))
  await page.route('**/auth/microsoft-calendar/events?**', (route) => json(route, upcomingMicrosoftEvents))
  await page.route('**/auth/microsoft-calendar/events', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({
      external_event_id: 'portal-event:portal-event-2',
      summary: 'Microsoft Town Hall',
      starts_at: '2026-08-13T18:00:00.000Z',
      ends_at: '2026-08-13T19:00:00.000Z',
      location: 'Assembly Hall',
    })
    return json(route, { connected: true, event_id: 'ms-added-1', web_link: 'https://outlook.office.com/calendar/item/added' })
  })
  await page.route('**/auth/microsoft-calendar', async (route) => {
    if (route.request().method() === 'GET') return json(route, microsoftCalendar)
    return route.fallback()
  })
}

test('calendar integrations page shows connected Google calendar and attending adds event to it', async ({ page }) => {
  await mockCalendarMember(page)

  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'Calendar Integrations', exact: true })).toBeVisible()
  await expect(page.getByText('Connected as member@gmail.test.')).toBeVisible()
  await expect(page.getByText('Existing Google meeting')).toBeVisible()

  await page.goto('/events')
  await expect(page.getByRole('button', { name: 'Attend: add to Google Calendar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download .ics' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Outlook' })).toBeVisible()
  await page.getByRole('button', { name: 'Attend: add to Google Calendar' }).click()
  await expect(page.getByText('Attendance saved and added to Google Calendar.')).toBeVisible()

  await page.goto('/calendar')
  await page.getByRole('button', { name: 'Disconnect Google Calendar' }).click()
  await expect(page.getByText('Google Calendar disconnected.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Connect Google Calendar' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('calendar integrations page shows connected Microsoft calendar and attending adds event to it', async ({ page }) => {
  await mockMicrosoftCalendarMember(page)

  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'Calendar Integrations', exact: true })).toBeVisible()
  await expect(page.getByText('Connected as member@outlook.test.')).toBeVisible()
  await expect(page.getByText('Existing Outlook meeting')).toBeVisible()

  await page.goto('/events')
  await expect(page.getByRole('button', { name: 'Attend: add to Microsoft Calendar' })).toBeVisible()
  await page.getByRole('button', { name: 'Attend: add to Microsoft Calendar' }).click()
  await expect(page.getByText('Attendance saved and added to Microsoft Calendar.')).toBeVisible()
})
