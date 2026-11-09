import { expect, it } from 'vitest'
import { searchPersonKey, searchPersonProfilePath } from './searchPerson'

it('uses the contact slug returned by search for both distinct accounts', () => {
  expect(searchPersonProfilePath({ user_id: 'account-1', contact_slug: 'jeffrey-scruggs' })).toBe('/users/jeffrey-scruggs')
  expect(searchPersonProfilePath({ user_id: 'account-2', contact_slug: 'jeffrey-scruggs-2' })).toBe('/users/jeffrey-scruggs-2')
})
it('prefers the canonical slug, supports old responses and falls back to the account ID', () => {
  expect(searchPersonKey({ contact_slug: 'canonical', slug: 'old', user_id: 'account' })).toBe('canonical')
  expect(searchPersonProfilePath({ slug: 'legacy' })).toBe('/users/legacy')
  expect(searchPersonProfilePath({ contact_slug: null, user_id: 'account-1' })).toBe('/users/account-1')
})
it('escapes identifiers and never constructs undefined or empty profile routes', () => {
  expect(searchPersonProfilePath({ contact_slug: ' name/with space ' })).toBe('/users/name%2Fwith%20space')
  expect(searchPersonProfilePath({})).toBe('/people')
  expect(searchPersonProfilePath({ contact_slug: 'undefined', slug: 'null', user_id: 'valid' })).toBe('/users/valid')
})
