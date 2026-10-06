export type FundOrganization = { id: string; name: string; slug: string; description?: string | null; tags?: string[] }

// These are registered, branded fund records, not inferred ownership or recipients.
export function organizationFunds(organization: { id: string; name: string }, directory: FundOrganization[]) {
 const prefix = organization.name.trim().toLocaleLowerCase() + ' '
 return [...new Map(directory.filter(fund => fund.id !== organization.id
  && fund.name.trim().toLocaleLowerCase().startsWith(prefix)
  && /\bfunds?\b/i.test(fund.name)
  && fund.tags?.some(tag => ['funding', 'fund', 'investment fund'].includes(tag.toLocaleLowerCase())))
  .map(fund => [fund.id, fund])).values()].sort((a, b) => a.name.localeCompare(b.name))
}
export async function loadOrganizationFunds(organization: { id: string; name: string }, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
 const directory: FundOrganization[] = []
 for (let offset = 0; ; offset += 500) {
  const response = await fetcher(`/api/org/api/network/orgs/public?${new URLSearchParams({ q: organization.name, limit: '500', offset: String(offset) })}`, { signal })
  if (!response.ok) throw new Error('Unable to load registered funds')
  const page: unknown = await response.json()
  if (!Array.isArray(page) || page.some(org => !org || typeof org.id !== 'string' || typeof org.name !== 'string' || typeof org.slug !== 'string' || (org.tags !== undefined && (!Array.isArray(org.tags) || org.tags.some((tag: unknown) => typeof tag !== 'string'))))) throw new Error('Invalid public fund directory')
  directory.push(...page)
  if (page.length < 500) break
 }
 return organizationFunds(organization, directory)
}
