type SearchPerson = { contact_slug?: string | null; slug?: string | null; user_id?: string | null }

/** Search returns contact_slug; older responses used slug. Account IDs also resolve. */
export function searchPersonKey(person: SearchPerson): string {
  for (const value of [person.contact_slug, person.slug, person.user_id]) {
    if (typeof value === 'string' && value.trim() && !['undefined', 'null'].includes(value.trim())) return value.trim()
  }
  return ''
}

export function searchPersonProfilePath(person: SearchPerson): string {
  const key = searchPersonKey(person)
  return key ? `/users/${encodeURIComponent(key)}` : '/people'
}
