import { expect, test, type Page, type Route } from '@playwright/test'

const authUser = {
  id: 'member-current',
  email: 'member@example.test',
  full_name: 'Current Member',
  identity_data: { display_name: 'Current Member' },
}

const members = [
  { user_id: 'member-kin', account_id: 'acct-kin', name: 'Jordan Kin', enrolled: true },
  { user_id: 'member-beneficiary', account_id: 'acct-beneficiary', name: 'Riley Beneficiary', enrolled: true },
]

const dashboard = {
  currency: 'DEM',
  standard_benefit_dena: 1000,
  attestation_threshold: 3,
  enrollment: null,
  claim: null,
  members,
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockAuthenticatedProgram(page: Page) {
  await page.route('**/api/org/**', (route) => json(route, {}))
  await page.route('**/auth/session-token', (route) => json(route, { access_token: 'header.payload.signature' }))
  await page.route('**/auth/me', (route) => json(route, authUser))
  await page.route('**/api/org/admin/me', (route) => json(route, { is_sysadmin: false }))
  await page.route('**/api/org/api/life-insurance', async (route) => {
    if (route.request().method() === 'GET') {
      await json(route, dashboard)
      return
    }
    await route.fallback()
  })
  await page.route('**/api/org/api/life-insurance/enrollment', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({
      birth_date: '1990-04-15',
      age: 36,
      next_of_kin_user_id: 'member-kin',
      beneficiary_user_id: 'member-beneficiary',
      accepted_terms: true,
    })
    await json(route, {
      ...dashboard,
      enrollment: {
        user_id: authUser.id,
        birth_date: payload.birth_date,
        confirmed_age: payload.age,
        next_of_kin_user_id: payload.next_of_kin_user_id,
        next_of_kin_name: 'Jordan Kin',
        next_of_kin_relationship: payload.next_of_kin_relationship,
        beneficiary_user_id: payload.beneficiary_user_id,
        beneficiary_name: 'Riley Beneficiary',
        beneficiary_relationship: payload.beneficiary_relationship,
        status: 'active',
      },
    })
  })
  await page.route('**/api/org/api/life-insurance/death-reports', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}')
    expect(payload).toMatchObject({
      deceased_user_id: 'member-kin',
      date_of_death: '2026-08-06',
      relationship_to_deceased: 'Friend',
      attested: true,
    })
    await json(route, {
      id: 'claim-1',
      deceased_user_id: 'member-kin',
      status: 'paid',
      report_count: 3,
      attestation_threshold: 3,
      payout_amount: 901.63,
      recipient_name: 'Jordan Next of Kin',
      beneficiary_source: 'next_of_kin',
      currency: 'DEM',
    }, 201)
  })
}

test('member enrolls and a third death attestation displays the Dena payout', async ({ page }) => {
  await mockAuthenticatedProgram(page)
  await page.goto('/life-insurance')
  await expect(page.getByRole('heading', { name: 'Protect the people you name' })).toBeVisible()

  await page.locator('#insurance-birthday').fill('1990-04-15')
  await page.locator('#insurance-age').fill('36')
  await page.locator('#insurance-next-of-kin').selectOption('member-kin')
  await page.locator('#insurance-next-of-kin-relationship').fill('Sibling')
  await page.locator('#insurance-beneficiary').selectOption('member-beneficiary')
  await page.locator('#insurance-beneficiary-relationship').fill('Partner')
  await page.locator('#insurance-enrollment-attestation').check()
  await page.getByRole('button', { name: 'Save enrollment' }).click()

  await expect(page.getByText('Enrollment saved. Your beneficiary selection is now active.')).toBeVisible()
  await expect(page.getByText('Beneficiary: Riley Beneficiary')).toBeVisible()

  await page.locator('#deceased-member').selectOption('member-kin')
  await page.locator('#date-of-death').fill('2026-08-06')
  await page.locator('#relationship-to-deceased').fill('Friend')
  await page.locator('#death-report-attestation').check()
  await page.getByRole('button', { name: 'Submit death report' }).click()

  await expect(page.getByText('Threshold reached. 901.63 DEM was paid to Jordan Next of Kin.')).toBeVisible()
  await expect(page.getByText('3 / 3')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
