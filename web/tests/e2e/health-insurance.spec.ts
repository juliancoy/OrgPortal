import { expect, test, type Page, type Route } from '@playwright/test'

const authUser = { id: 'member-current', email: 'member@example.test', full_name: 'Current Member' }

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockHealthProgram(page: Page) {
  let dashboard = {
    enrollment: null as null | Record<string, unknown>,
    claims: [] as Array<Record<string, unknown>>,
    services: [{
      id: 'primary-care', name: 'Primary care appointment', description: 'Request a general health appointment.',
      timezone: 'UTC', slot_minutes: 30, available_to_all: true, hours: [],
    }],
    appointments: [] as Array<Record<string, unknown>>,
    code_reference_version: 'Health claim codes 2026-Q3',
    service_access: 'Coverage follows published service availability for every authenticated member.',
  }
  await page.route('**/api/org/**', (route) => json(route, {}))
  await page.route('**/auth/session-token', (route) => json(route, { access_token: 'header.payload.signature' }))
  await page.route('**/auth/me', (route) => json(route, authUser))
  await page.route('**/api/org/admin/me', (route) => json(route, { is_sysadmin: false }))
  await page.route('**/api/org/api/health-insurance', async (route) => {
    if (route.request().method() === 'GET') return json(route, dashboard)
    return route.fallback()
  })
  await page.route('**/api/org/api/health-insurance/enrollment', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toEqual({ state_code: 'MD', program: 'standard', coverage_effective_date: '2026-01-01', attested: true })
    dashboard = { ...dashboard, enrollment: { ...payload, status: 'active' } }
    await json(route, dashboard.enrollment)
  })
  await page.route('**/api/org/api/health-insurance/claims', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({
      service_id: 'primary-care',
      service_date: '2026-08-01', provider_npi: '1234567893', place_of_service: '11',
      diagnosis_codes: ['E11.9'], attested: true,
      lines: [{ code_system: 'HCPCS_LEVEL_II', code: 'A4253', modifiers: ['NU'], units: 2, billed_amount_usd: 18.13 }],
    })
    const claim = {
      id: 'claim-1', service_date: payload.service_date, provider_npi: payload.provider_npi,
      status: 'received', coverage_determination: 'available', total_billed_usd: 18.13,
      diagnosis_codes: payload.diagnosis_codes,
      lines: payload.lines.map((line: Record<string, unknown>, index: number) => ({ ...line, line_number: index + 1 })),
    }
    dashboard = { ...dashboard, claims: [claim] }
    await json(route, claim, 201)
  })
  await page.route('**/api/org/api/health-insurance/appointments', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toEqual({ service_id: 'primary-care', starts_at: '2026-08-10T13:00:00.000Z', attested: true })
    const appointment = {
      id: 'appointment-1', service_id: payload.service_id, service_name: 'Primary care appointment',
      starts_at: payload.starts_at, ends_at: '2026-08-10T13:30:00.000Z', status: 'requested',
    }
    dashboard = { ...dashboard, appointments: [appointment] }
    await json(route, appointment, 201)
  })
}

test('member records coverage, submits codes, and schedules an available service', async ({ page }) => {
  await mockHealthProgram(page)
  await page.goto('/health-insurance')
  await expect(page.getByRole('heading', { name: 'Health insurance code intake' })).toBeVisible()

  const coverageForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Coverage record' }) })
  await coverageForm.getByLabel('State or territory').selectOption('MD')
  await coverageForm.getByLabel('Program').selectOption('standard')
  await coverageForm.getByLabel('Coverage effective date').fill('2026-01-01')
  await coverageForm.getByRole('checkbox').check()
  await coverageForm.getByRole('button', { name: 'Save coverage record' }).click()
  await expect(page.getByText('Coverage details saved.')).toBeVisible()

  const claimForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Claim-code intake' }) })
  await claimForm.getByLabel('Available service').selectOption('primary-care')
  await claimForm.getByLabel('Service date').fill('2026-08-01')
  await claimForm.getByLabel('Provider NPI').fill('1234567893')
  await claimForm.getByLabel('Place of service').fill('11')
  await claimForm.getByLabel('ICD-10-CM diagnoses').fill('E11.9')
  await claimForm.getByLabel('Code system').selectOption('HCPCS_LEVEL_II')
  await claimForm.getByLabel('Code', { exact: true }).fill('A4253')
  await claimForm.getByLabel('Modifiers').fill('NU')
  await claimForm.getByLabel('Units').fill('2')
  await claimForm.getByLabel('Billed USD').fill('18.13')
  await claimForm.getByRole('checkbox').check()
  await claimForm.getByRole('button', { name: 'Submit claim codes' }).click()

  await expect(page.getByText('Claim codes recorded.')).toBeVisible()
  await expect(page.getByText('Available', { exact: true })).toBeVisible()
  await expect(page.getByText('A4253')).toBeVisible()

  const calendarForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Request appointment' }) })
  await calendarForm.getByLabel('Service').selectOption('primary-care')
  await calendarForm.getByLabel('Date').fill('2026-08-10')
  await calendarForm.getByLabel('Time (UTC)').selectOption('13:00')
  await calendarForm.getByRole('checkbox').check()
  await calendarForm.getByRole('button', { name: 'Request appointment' }).click()
  await expect(page.getByText('Appointment requested. It remains pending until the service confirms it.')).toBeVisible()
  await expect(page.getByText('Primary care appointment').last()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
