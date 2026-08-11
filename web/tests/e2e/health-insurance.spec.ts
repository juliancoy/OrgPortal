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
      timezone: 'UTC', slot_minutes: 30, available_to_all: true, host_type: 'shared', hours: [
        { weekday: 1, starts_at: '13:00', ends_at: '21:00' },
        { weekday: 2, starts_at: '13:00', ends_at: '21:00' },
        { weekday: 3, starts_at: '13:00', ends_at: '21:00' },
        { weekday: 4, starts_at: '13:00', ends_at: '21:00' },
        { weekday: 5, starts_at: '13:00', ends_at: '21:00' },
      ],
    }],
    appointments: [] as Array<Record<string, unknown>>,
    analyses: [] as Array<Record<string, unknown>>,
    collaborative_diagnoses: [] as Array<Record<string, unknown>>,
    history: [] as Array<Record<string, unknown>>,
    code_reference_version: 'Health claim codes 2026-Q3',
    diagnosis_reference_version: 'Health diagnosis catalog 2026-Q3',
    service_access: 'Every member can use published services directly through this record.',
    code_catalog: {
      diagnoses: [
        { code: 'E11.9', label: 'Type 2 diabetes mellitus without complications', description: 'Diabetes without recorded complications.', keywords: ['diabetes'] },
        { code: 'I10', label: 'Essential primary hypertension', description: 'Chronic high blood pressure.', keywords: ['hypertension'] },
      ],
      claim_codes: [
        { code_system: 'HCPCS_LEVEL_II', code: 'A4253', label: 'Blood glucose test or reagent strips', description: 'Glucose monitoring supply.', keywords: ['glucose strips'] },
      ],
    },
  }
  await page.route('**/api/org/**', (route) => json(route, {}))
  await page.route('**/auth/session-token', (route) => json(route, { access_token: 'header.payload.signature' }))
  await page.route('**/auth/me', (route) => json(route, authUser))
  await page.route('**/auth/google-calendar', async (route) => {
    if (route.request().method() === 'GET') return json(route, { connected: false, google_email: null, calendar_id: null, sync_busy: false, updated_at: null })
    return route.fallback()
  })
  await page.route('**/api/org/admin/me', (route) => json(route, { is_sysadmin: false }))
  await page.route('**/api/org/api/accounts?**', async (route) => {
    await json(route, [
      { id: 'acct-1', user_id: authUser.id, name: authUser.full_name, email: authUser.email },
      { id: 'acct-2', user_id: 'member-2', name: 'Jordan Supporter', email: 'jordan@example.test' },
    ])
  })
  await page.route('**/api/org/api/health-insurance', async (route) => {
    if (route.request().method() === 'GET') return json(route, dashboard)
    return route.fallback()
  })
  await page.route('**/api/org/api/health-insurance/diagnoses?**', async (route) => {
    const url = new URL(route.request().url())
    const patientUserId = url.searchParams.get('patient_user_id') || authUser.id
    const patient = patientUserId === authUser.id
      ? { user_id: authUser.id, name: authUser.full_name, is_self: true }
      : { user_id: 'member-2', name: 'Jordan Supporter', is_self: false }
    await json(route, {
      patient,
      diagnoses: dashboard.collaborative_diagnoses.filter((diagnosis) => diagnosis.patient_user_id === patient.user_id),
      diagnosis_reference_version: dashboard.diagnosis_reference_version,
      code_catalog: { diagnoses: dashboard.code_catalog.diagnoses },
    })
  })
  await page.route('**/api/org/api/health-insurance/enrollment', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toEqual({
      program: 'standard',
      coverage_effective_date: '2026-01-01',
      suspected_diagnosis_codes: ['E11.9'],
      issue_summary: 'Recurring dizziness and high blood sugar after exertion.',
      attested: true,
    })
    dashboard = {
      ...dashboard,
      enrollment: {
        ...payload,
        status: 'active',
        suspected_diagnosis_details: dashboard.code_catalog.diagnoses.filter((entry) => payload.suspected_diagnosis_codes.includes(entry.code)),
      },
      history: [{ id: 'profile-1', event_type: 'profile_update', occurred_at: '2026-08-08T12:00:00.000Z', title: 'Health profile updated', summary: payload.issue_summary, metadata: {} }],
    }
    await json(route, dashboard.enrollment)
  })
  await page.route('**/api/org/api/health-insurance/claims', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({
      service_id: 'primary-care',
      service_date: '2026-08-01',
      provider_npi: '1234567893',
      place_of_service: '11',
      diagnosis_codes: ['E11.9'],
      suspected_diagnosis_codes: ['E11.9', 'I10'],
      issue_summary: 'Persistent headaches with pressure spikes.',
      attested: true,
      lines: [{ code_system: 'HCPCS_LEVEL_II', code: 'A4253', modifiers: ['NU'], units: 2, billed_amount_usd: 18.13 }],
    })
    const claim = {
      id: 'claim-1',
      service_date: payload.service_date,
      provider_npi: payload.provider_npi,
      status: 'received',
      coverage_determination: 'available',
      total_billed_usd: 18.13,
      diagnosis_codes: payload.diagnosis_codes,
      diagnosis_details: dashboard.code_catalog.diagnoses.filter((entry) => payload.diagnosis_codes.includes(entry.code)),
      suspected_diagnosis_codes: payload.suspected_diagnosis_codes,
      suspected_diagnosis_details: dashboard.code_catalog.diagnoses.filter((entry) => payload.suspected_diagnosis_codes.includes(entry.code)),
      issue_summary: payload.issue_summary,
      line_details: payload.lines.map((line: Record<string, unknown>) => ({ ...line, label: 'Blood glucose test or reagent strips', description: 'Glucose monitoring supply.' })),
      lines: payload.lines.map((line: Record<string, unknown>, index: number) => ({ ...line, line_number: index + 1 })),
    }
    dashboard = {
      ...dashboard,
      claims: [claim],
      history: [
        { id: 'claim-1', event_type: 'claim', occurred_at: '2026-08-08T13:00:00.000Z', title: 'Claim codes recorded', summary: payload.issue_summary, metadata: {} },
        ...dashboard.history,
      ],
    }
    await json(route, claim, 201)
  })
  await page.route('**/api/org/api/health-insurance/diagnoses', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({ code: 'E11.9' })
    const collaborative = {
      id: 'diag-1',
      patient_user_id: authUser.id,
      code: 'E11.9',
      label: 'Type 2 diabetes mellitus without complications',
      description: 'Diabetes without recorded complications.',
      note: payload.note || 'Patient self-submitted this diagnosis.',
      submitted_by_user_id: authUser.id,
      submitted_by_name: authUser.full_name,
      self_reported: true,
      supporter_count: payload.note ? 1 : 2,
      supporters: payload.note
        ? [{ supporter_user_id: authUser.id, supporter_name: authUser.full_name, created_at: '2026-08-08T12:15:00.000Z' }]
        : [
            { supporter_user_id: authUser.id, supporter_name: authUser.full_name, created_at: '2026-08-08T12:15:00.000Z' },
            { supporter_user_id: 'member-2', supporter_name: 'Jordan Supporter', created_at: '2026-08-08T12:45:00.000Z' },
          ],
      viewer_supports: true,
      created_at: '2026-08-08T12:15:00.000Z',
      updated_at: payload.note ? '2026-08-08T12:15:00.000Z' : '2026-08-08T12:45:00.000Z',
    }
    dashboard = {
      ...dashboard,
      collaborative_diagnoses: [collaborative],
      history: [
        { id: 'diag-1', event_type: 'diagnosis', occurred_at: collaborative.updated_at, title: 'E11.9 Type 2 diabetes mellitus without complications', summary: collaborative.note, metadata: {} },
        ...dashboard.history,
      ],
    }
    await json(route, collaborative, 201)
  })
  await page.route('**/api/org/api/health-insurance/appointments', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toEqual({ service_id: 'primary-care', starts_at: '2026-08-10T13:00:00.000Z', attested: true })
    const appointment = {
      id: 'appointment-1', service_id: payload.service_id, service_name: 'Primary care appointment',
      starts_at: payload.starts_at, ends_at: '2026-08-10T13:30:00.000Z', status: 'requested',
    }
    dashboard = {
      ...dashboard,
      appointments: [appointment],
      history: [
        { id: 'appointment-1', event_type: 'appointment', occurred_at: '2026-08-08T14:00:00.000Z', title: 'Primary care appointment Requested', summary: '2026-08-10T13:00:00.000Z to 2026-08-10T13:30:00.000Z', metadata: {} },
        ...dashboard.history,
      ],
    }
    await json(route, appointment, 201)
  })
  await page.route('**/api/org/api/health-insurance/services', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({
      host_type: 'individual',
      name: 'Half-hour session',
      timezone: 'UTC',
      slot_minutes: 30,
      capacity_per_slot: 1,
      weekdays: [1, 2, 3, 4, 5],
      starts_at: '14:00',
      ends_at: '17:00',
      google_calendar_sync: false,
      google_block_busy: false,
    })
    await json(route, { id: 'service-published', ...payload }, 201)
  })
  await page.route('**/api/org/api/health-insurance/analysis', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toEqual({ analysis_kind: 'triage' })
    const analysis = {
      id: 'analysis-1',
      analysis_kind: 'triage',
      status: 'ready',
      requested_at: '2026-08-08T15:00:00.000Z',
      summary: { headline: 'Triage snapshot prepared', findings: ['2 suspected diagnosis entries on file.'], next_steps: ['Review the most recent coded visit.'] },
    }
    dashboard = {
      ...dashboard,
      analyses: [analysis],
      history: [
        { id: 'analysis-1', event_type: 'analysis', occurred_at: '2026-08-08T15:00:00.000Z', title: 'Triage analysis', summary: 'Triage snapshot prepared', metadata: {} },
        ...dashboard.history,
      ],
    }
    await json(route, analysis, 201)
  })
}

test('member maintains the profile, searches codes by name, and sees the full record history', async ({ page }) => {
  await mockHealthProgram(page)
  await page.goto('/health-insurance')
  await expect(page.getByRole('heading', { name: 'Health record and code intake' })).toBeVisible()

  const profileForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Health profile' }) })
  await profileForm.getByLabel('Program').selectOption('standard')
  await profileForm.getByLabel('Coverage effective date').fill('2026-01-01')
  await profileForm.getByLabel('Suspected diagnoses').fill('diabetes')
  await profileForm.locator('.health-insurance-search-results').getByRole('button', { name: /E11\.9/i }).click()
  await profileForm.getByLabel('Describe your medical issues').fill('Recurring dizziness and high blood sugar after exertion.')
  await profileForm.getByRole('checkbox').check()
  await profileForm.getByRole('button', { name: 'Save health profile' }).click()
  await expect(page.getByText('Health profile saved.')).toBeVisible()

  const diagnosisForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Contribute diagnosis' }) })
  await page.getByRole('button', { name: authUser.full_name }).click()
  await diagnosisForm.getByLabel('Place a diagnosis on your collaborative board').fill('diabetes')
  await diagnosisForm.locator('.health-insurance-search-results').getByRole('button', { name: /E11\.9/i }).click()
  await diagnosisForm.getByLabel('Contribution note').fill('Patient self-submitted this diagnosis.')
  await diagnosisForm.getByRole('button', { name: 'Contribute diagnosis' }).click()
  await expect(page.getByText('Diagnosis submitted and your support recorded.')).toBeVisible()
  await expect(page.locator('.health-insurance-diagnosis-supporters').getByText('Current Member', { exact: true })).toBeVisible()

  const claimForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Claim-code intake' }) })
  await claimForm.getByLabel('Available service').selectOption('primary-care')
  await claimForm.getByLabel('Service date').fill('2026-08-01')
  await claimForm.getByLabel('Provider NPI').fill('1234567893')
  await claimForm.getByLabel('Place of service').fill('11')
  await claimForm.getByLabel('Confirmed diagnoses').fill('diabetes')
  await claimForm.locator('.health-insurance-search-results').nth(0).getByRole('button', { name: /E11\.9/i }).click()
  await claimForm.getByLabel('Patient suspected diagnoses').fill('hypertension')
  await claimForm.locator('.health-insurance-search-results').nth(1).getByRole('button', { name: /I10/i }).click()
  await claimForm.getByLabel('Describe your medical issues').fill('Persistent headaches with pressure spikes.')
  await claimForm.getByLabel('Search code by name').fill('glucose strips')
  await claimForm.locator('.health-insurance-search-results-inline').getByRole('button', { name: /A4253/i }).click()
  await claimForm.getByLabel('Modifiers').fill('NU')
  await claimForm.getByLabel('Units').fill('2')
  await claimForm.getByLabel('Billed USD').fill('18.13')
  await claimForm.getByRole('checkbox').check()
  await claimForm.getByRole('button', { name: 'Submit claim codes' }).click()
  await expect(page.getByText('Claim codes recorded.')).toBeVisible()
  await expect(page.getByText('You support this diagnosis.')).toBeVisible()
  await expect(page.getByText('1 approval')).toBeVisible()

  await page.getByRole('button', { name: 'Prepare triage' }).click()
  await expect(page.getByText('Triage analysis prepared.')).toBeVisible()
  await expect(page.locator('.health-insurance-analysis-list').getByText('Triage snapshot prepared').first()).toBeVisible()

  const calendarForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Request appointment' }) })
  await calendarForm.getByLabel('Service').selectOption('primary-care')
  await calendarForm.getByLabel('Date').fill('2026-08-10')
  await calendarForm.getByLabel('Time (UTC)').selectOption('13:00')
  await calendarForm.getByRole('checkbox').check()
  await calendarForm.getByRole('button', { name: 'Request appointment' }).click()
  await expect(page.getByText('Appointment requested. It remains pending until the service confirms it.')).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Entire history' })).toBeVisible()
  await expect(page.getByText('Health profile updated')).toBeVisible()
  await expect(page.getByText('Claim codes recorded')).toBeVisible()
  await expect(page.getByText('Triage analysis')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to provider portal' })).toHaveAttribute('href', '/provider-scheduling')
  await expect(page.getByRole('button', { name: 'Publish recurring session calendar' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
