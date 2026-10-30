type OrganizationEvent = { id: string; starts_at?: string | null; event_date?: string | null }

/** The organization feed already scopes hosting and participation; show one calendar. */
export function organizationCalendarEvents<T extends OrganizationEvent>(events: T[]): T[] {
 const time = (event: T) => {
  const value = Date.parse(event.starts_at || event.event_date || '')
  return Number.isFinite(value) ? value : Infinity
 }
 return [...new Map(events.map(event => [event.id,event])).values()].sort((a,b)=>time(a)-time(b))
}
