type Organization = { id: string; slug: string }
type Event = { host_org_id?: string | null; organization_slug?: string | null; starts_at?: string | null; event_date?: string | null }

export function groupOrganizationEvents<T extends Event>(events: T[], organization: Organization) {
  const time = (event: T) => Date.parse(event.starts_at || event.event_date || '') || Infinity
  const sorted = [...events].sort((a, b) => time(a) - time(b))
  const hosted = (event: T) => event.host_org_id
    ? event.host_org_id === organization.id
    : event.organization_slug === organization.slug
  return [
    { kind: 'hosted' as const, events: sorted.filter(hosted) },
    { kind: 'related' as const, events: sorted.filter(event => !hosted(event)) },
  ]
}
