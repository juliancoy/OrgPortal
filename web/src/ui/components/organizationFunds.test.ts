import { describe, expect, it } from 'vitest'
import { loadOrganizationFunds, organizationFunds, type FundOrganization } from './organizationFunds'
const parent = { id: 'tedco', name: 'TEDCO' }
const fund: FundOrganization = { id: 'equitech', name: 'TEDCO Equitech Growth Fund', slug: 'tedco-equitech-growth-fund', tags: ['funding'] }
describe('organization funds', () => {
 it('groups real registered funds without listing recipients, similar names, or unrelated funds', () => {
  expect(organizationFunds(parent, [fund, fund,
   { ...fund, id: parent.id }, { ...fund, id: 'company', name: 'TEDCO recipient company' },
   { ...fund, id: 'other', name: 'Other TEDCO Fund' }, { ...fund, id: 'prefix', name: 'TEDCO2 Fund' },
   { ...fund, id: 'untagged', tags: [] }])).toEqual([fund])
  expect(organizationFunds({ id: 'other', name: 'Other' }, [fund])).toEqual([])
 })
 it('loads the authoritative paginated directory, not bundled research', async () => {
  const urls: string[] = []
  const fetcher = async (url: string | URL | Request) => {
   urls.push(String(url))
   return Response.json(urls.length === 1 ? Array.from({ length: 500 }, (_, i) => ({ ...fund, id: String(i), name: `TEDCO Company ${i}` })) : [fund])
  }
  expect(await loadOrganizationFunds(parent, fetcher as typeof fetch)).toEqual([fund])
  expect(urls[1]).toContain('offset=500'); expect(urls[0]).toContain('q=TEDCO')
 })
 it('reports network failures and malformed data rather than displaying an empty list', async () => {
  await expect(loadOrganizationFunds(parent, (async () => new Response('', { status: 503 })) as typeof fetch)).rejects.toThrow('Unable to load')
  await expect(loadOrganizationFunds(parent, (async () => Response.json([{ id: 'bad' }])) as typeof fetch)).rejects.toThrow('Invalid')
 })
})
