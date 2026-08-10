import { expect, test, type Page, type Route } from '@playwright/test'

const authUser = { id: 'provider-current', email: 'provider@example.test', full_name: 'Current Provider' }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockProviderScheduling(page: Page) {
  let providerDashboard = {
    services: [{
      id: 'provider-service-1',
      name: 'Half-hour session',
      description: 'Book a 30-minute session through the provider portal.',
      timezone: 'UTC',
      slot_minutes: 30,
      available_to_all: true,
      host_type: 'individual',
      host_user_id: authUser.id,
      host_user_name: authUser.full_name,
      host_org_id: null,
      host_org_name: null,
      google_calendar_sync: true,
      google_block_busy: true,
      hours: [
        { weekday: 1, starts_at: '14:00', ends_at: '17:00' },
        { weekday: 2, starts_at: '14:00', ends_at: '17:00' },
        { weekday: 3, starts_at: '14:00', ends_at: '17:00' },
        { weekday: 4, starts_at: '14:00', ends_at: '17:00' },
        { weekday: 5, starts_at: '14:00', ends_at: '17:00' },
      ],
    }],
    appointments: [{
      id: 'appointment-1',
      service_id: 'provider-service-1',
      service_name: 'Half-hour session',
      starts_at: '2026-08-12T14:00:00.000Z',
      ends_at: '2026-08-12T14:30:00.000Z',
      status: 'requested',
      attendee_user_id: 'member-2',
      attendee_name: 'Jordan Booker',
      attendee_email: 'jordan@example.test',
    }],
  }
  let googleCalendar = {
    connected: true,
    google_email: 'provider@gmail.test',
    calendar_id: 'primary',
    sync_busy: true,
    updated_at: '2026-08-11T12:00:00.000Z',
  }

  await page.route('**/api/org/**', (route) => json(route, {}))
  await page.route('**/auth/session-token', (route) => json(route, { access_token: 'header.payload.signature' }))
  await page.route('**/auth/me', (route) => json(route, authUser))
  await page.route('**/api/org/admin/me', (route) => json(route, { is_sysadmin: false }))
  await page.route('**/auth/google-calendar', async (route) => {
    if (route.request().method() === 'GET') return json(route, googleCalendar)
    if (route.request().method() === 'DELETE') {
      googleCalendar = { ...googleCalendar, connected: false, google_email: null, calendar_id: null, sync_busy: false, updated_at: '2026-08-11T12:30:00.000Z' }
      providerDashboard = {
        ...providerDashboard,
        services: providerDashboard.services.map((service) => ({
          ...service,
          google_calendar_sync: false,
          google_block_busy: false,
        })),
      }
      return json(route, { ok: true })
    }
    return route.fallback()
  })
  await page.route('**/api/org/api/network/orgs?**', (route) => json(route, [
    { id: 'org-1', name: 'Care Collective', slug: 'care-collective', my_role: 'owner' },
  ]))
  await page.route('**/api/org/api/health-insurance/provider', async (route) => json(route, providerDashboard))
  await page.route('**/api/org/api/health-insurance/services', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({
      host_type: 'individual',
      name: 'Weekday consult',
      timezone: 'UTC',
      slot_minutes: 30,
      capacity_per_slot: 1,
      weekdays: [1, 2, 3, 4, 5],
      starts_at: '14:00',
      ends_at: '17:00',
      google_calendar_sync: true,
      google_block_busy: true,
    })
    providerDashboard = {
      ...providerDashboard,
      services: [
        ...providerDashboard.services,
        {
          id: 'provider-service-2',
          description: payload.description,
          available_to_all: true,
          host_user_id: authUser.id,
          host_user_name: authUser.full_name,
          host_org_id: null,
          host_org_name: null,
          ...payload,
          slot_minutes: 30,
          hours: payload.weekdays.map((weekday: number) => ({ weekday, starts_at: payload.starts_at, ends_at: payload.ends_at })),
        },
      ],
    }
    await json(route, { id: 'provider-service-2', ...payload }, 201)
  })
}

test('provider portal publishes recurring availability and shows bookings', async ({ page }) => {
  await mockProviderScheduling(page)
  await page.goto('/provider-scheduling')

  await expect(page.getByRole('heading', { name: 'Provider scheduling' })).toBeVisible()
  await expect(page.getByText('Connected as provider@gmail.test.')).toBeVisible()
  await expect(page.getByText('Jordan Booker')).toBeVisible()
  await expect(page.getByText('Google sync on')).toBeVisible()

  const publishForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Publish recurring session calendar' }) })
  await publishForm.getByLabel('Session title').fill('Weekday consult')
  await publishForm.getByLabel('Description').fill('Thirty-minute booking block for members.')
  await publishForm.getByRole('checkbox', { name: 'Publish this recurring availability to my Google Calendar.' }).check()
  await publishForm.getByRole('checkbox', { name: 'Block portal slots that conflict with my Google busy times.' }).check()
  await publishForm.getByRole('button', { name: 'Publish recurring session calendar' }).click()

  await expect(page.getByText('Recurring appointment calendar published.')).toBeVisible()
  await expect(page.getByText('Weekday consult')).toBeVisible()
  await expect(page.getByText('Busy-time blocking on')).toHaveCount(2)

  await page.getByRole('button', { name: 'Disconnect Google Calendar' }).click()
  await expect(page.getByText('Google Calendar disconnected.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Connect Google Calendar' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
