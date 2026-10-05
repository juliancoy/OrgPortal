import { expect, test } from '@playwright/test'

// Public UI only: no login, retained session, external writes, or real tenant data.
test('public organization shows descendants, nonmonetary support and source provenance', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/auth/session-token', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await page.route('**/auth/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/org/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path.endsWith('/api/portal/tenant')) body = {}
    else if (path.endsWith('/orgs/public/parent')) body = { id: 'parent', slug: 'parent', name: 'Parent organization', description: 'Support network', membership_count: 0, pending_challenges_count: 0, media: [] }
    else if (path.endsWith('/parent/support')) body = {
      descendants: [{ id: 'child', slug: 'child', name: 'Supported organization', is_direct: 1 }, { id: 'grandchild', slug: 'grandchild', name: 'Indirect organization', is_direct: 0 }],
      supporters: [{ id: 'funder', slug: 'funder', name: 'Supporting foundation' }],
      records: [{ id: 'support:mentoring', record_id: 'mentoring', record_type: 'organization_support', timestamp: '2026-10-04', occurred_at: 'Fall 2026', transaction_type: 'mentoring', amount: null, currency: null, amount_label: '', quantity: 12, unit: 'hours', description: 'Startup office hours', from_label: 'Parent organization', to_label: 'Supported organization', from_organization_id: 'parent', to_organization_id: 'child', from_organization_slug: 'parent', to_organization_slug: 'child', status: 'reported', void_reason: null, source_url: 'https://example.test/report', evidence: 'Public report', notes: '', provenance_json: JSON.stringify([{ source: 'LifeTech Associates', sheet: 'Funding Network', row: 3, snapshot: '2026-10-01' }]) }],
    }
    else if (path.includes('/portal/')) body = { portal: null }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.route('**/api/users/me**', route => route.fulfill({ status: 401, body: '{}' }))
  await page.goto('/orgs/parent')
  const support = page.getByRole('region', { name: 'Organization support and descendants' })
  await expect(support.getByRole('heading', { name: 'Descendant organizations' })).toBeVisible({ timeout: 30_000 })
  await expect(support.getByRole('link', { name: 'Supported organization', exact: true })).toBeVisible()
  await expect(support.getByText('Indirect descendant', { exact: true })).toBeVisible()
  await expect(support.getByRole('link', { name: 'Supporting foundation' })).toBeVisible()
  await support.getByText('Support records and source evidence (1)', { exact: true }).click()
  await expect(support.getByRole('cell', { name: '12 hours', exact: true })).toBeVisible()
  await expect(support.getByText('LifeTech Associates · Funding Network · row 3 · snapshot 2026-10-01', { exact: true })).toBeVisible()
  await expect(support.getByRole('link', { name: 'View source' })).toHaveAttribute('href', 'https://example.test/report')
  await expect(support.getByText('Record organizational support', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)
})
