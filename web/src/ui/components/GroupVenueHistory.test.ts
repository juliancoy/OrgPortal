import { describe, expect, it } from 'vitest'
import { commonGroupVenues } from './GroupVenueHistory'
describe('group venue history', () => {
  it('counts past uses, merges case differences and excludes current, future and unknown venues', () => {
    const events = [
      { id: 'a', event_date: '2020-01-01', location: 'Brewery' },
      { id: 'b', event_date: '2021-01-01', location: 'brewery' },
      { id: 'c', event_date: '2022-01-01', location: 'Library' },
      { id: 'current', event_date: '2020-01-01', location: 'Library' },
      { id: 'future', event_date: '2099-01-01', location: 'Library' },
      { id: 'unknown', event_date: '2020-01-01', location: 'TBD' },
    ]
    expect(commonGroupVenues(events, 'current', Date.parse('2026-10-08'))).toEqual([
      { name: 'brewery', venueId: undefined, count: 2 }, { name: 'Library', venueId: undefined, count: 1 },
    ])
  })
})
