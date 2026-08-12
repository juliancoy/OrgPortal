import { expect, test, type Page, type Route } from '@playwright/test'

const authUser = {
  id: 'member-current',
  email: 'member@example.test',
  full_name: 'Current Member',
  identity_data: { display_name: 'Current Member' },
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockAuthenticatedPortal(page: Page) {
  await page.route('**/api/org/**', (route) => json(route, {}))
  await page.route('**/auth/session-token', (route) => json(route, { access_token: 'header.payload.signature' }))
  await page.route('**/auth/me', (route) => json(route, authUser))
  await page.route('**/api/org/admin/me', (route) => json(route, { is_sysadmin: false }))
}

test('member can stage property and casualty administration in Dena without horizontal overflow', async ({ page }) => {
  await mockAuthenticatedPortal(page)
  await page.goto('/property-casualty-insurance')

  await expect(page.getByRole('heading', { name: 'Property and casualty insurance' })).toBeVisible()
  await expect(page.getByText('DENNA-administered insurance')).toBeVisible()

  await page.getByLabel('Coverage class').selectOption('bundle')
  await page.getByLabel('Covered asset or operation').fill('Warehouse A and delivery operations')
  await page.getByLabel('Replacement value (DEM)').fill('12000')
  await page.getByLabel('Deductible (DEM)').fill('750')
  await page.getByLabel('Stewardship and risk controls').fill('Fire suppression, secured loading, and incident review are in place.')
  await page.getByRole('checkbox', { name: /administered in Dena within the DENNA system/i }).check()

  await page.goto('/about')
  await page.goto('/property-casualty-insurance')
  await expect(page.getByLabel('Covered asset or operation')).toHaveValue('Warehouse A and delivery operations')
  await expect(page.getByLabel('Replacement value (DEM)')).toHaveValue('12000')
  await expect(page.getByLabel('Deductible (DEM)')).toHaveValue('750')
  await expect(page.getByLabel('Stewardship and risk controls')).toHaveValue('Fire suppression, secured loading, and incident review are in place.')
  await expect(page.getByRole('checkbox', { name: /administered in Dena within the DENNA system/i })).toBeChecked()

  await page.getByRole('button', { name: 'Save coverage intake' }).click()
  await expect(page.getByText(/Coverage intake saved\./)).toBeVisible()

  await page.getByLabel('Incident date').fill('2026-08-08')
  await page.getByLabel('Incident type').selectOption('property_damage')
  await page.getByLabel('Requested reserve (DEM)').fill('6800')
  await page.getByLabel('Incident narrative').fill('Wind damage affected the loading doors and interrupted normal shipping for one day.')
  await page.getByRole('checkbox', { name: /ready for DENNA reserve review/i }).check()
  await page.getByRole('button', { name: 'Stage claim intake' }).click()

  await expect(page.getByText(/Claim intake staged\./)).toBeVisible()
  await expect(page.locator('.property-casualty-amount')).toHaveText('6,050 DEM')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
