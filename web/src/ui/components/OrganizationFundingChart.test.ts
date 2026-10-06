import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { OrganizationFundingChart, type FundingCounterparty } from './OrganizationFundingChart'
const row = (name: string, amount: number | null, direction: FundingCounterparty['direction'] = 'received'): FundingCounterparty => ({ name, amount, direction, organizationId: name, counterpartKey: name, slug: name, currency: amount === null ? null : 'USD', status: 'reported', recordCount: 1, undisclosedCount: amount === null ? 1 : 0, lowerBoundCount: 0 })
const render = (rows: FundingCounterparty[]) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(OrganizationFundingChart, { rows })))
describe('organization counterparty charts', () => {
  it('ranks each currency and status separately, links organizations and leaves unknowns without bars', () => {
    const html = render([row('Small', 50), row('Large', 100), row('Unknown', null), { ...row('Euro', 400), currency: 'EUR' }, row('Recipient', 10, 'deployed')])
    expect(html.indexOf('>Large<')).toBeLessThan(html.indexOf('>Small<'))
    expect(html).toContain('width:50%')
    expect(html.match(/width:100%/g)).toHaveLength(3)
    expect(html).toContain('href="/orgs/Large"')
    expect(html).toContain('Undisclosed')
    expect(html).toContain('Funders bar charts')
    expect(html).toContain('Recipients bar charts')
  })
  it('limits initial chart rendering while preserving honest empty states', () => {
    const html = render(Array.from({ length: 70 }, (_, index) => row(`Funder${index}`, index + 1)))
    expect(html.match(/class="tedco-chart-heading"/g)).toHaveLength(50)
    expect(html).toContain('Load more')
    expect(html).toContain('No documented monetary recipients yet.')
    expect(render([])).toContain('No documented monetary funders yet.')
  })
})
