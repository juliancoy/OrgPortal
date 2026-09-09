import { describe, expect, it } from 'vitest'
import { medTechEventImageUrl, selectMedTechEvents, selectOwnedMedTechEvents, MEDTECH_OWNED_EVENTS_PATH } from './medtechCommunity'

describe('MedTech published calendar', () => {
  const now = Date.parse('2026-09-08T12:00:00Z')
  const event = { name: 'Biotech meetup', startDate: '2026-09-09T12:00:00Z', url: 'https://luma.com/meetup' }

  it('uses the original feed image host, with organizer fallback and safe protocols', () => {
    expect(medTechEventImageUrl({ ...event, imageUrl: '/event_images/meetup.webp' })).toBe('https://codecollective.us/event_images/meetup.webp')
    expect(medTechEventImageUrl({ ...event, imageUrl: 'https://images.example/event.jpg' })).toBe('https://images.example/event.jpg')
    expect(medTechEventImageUrl({ ...event, imageUrl: '', orgImageUrl: '/images/organizer.png' })).toBe('https://codecollective.us/images/organizer.png')
    expect(medTechEventImageUrl({ ...event, imageUrl: 'javascript:alert(1)', orgImageUrl: 'data:text/html,unsafe' })).toBeNull()
    expect(medTechEventImageUrl(event)).toBeNull()
  })

  it('selects upcoming medical events and sorts them, excluding invalid and unrelated entries', () => {
    const later = { ...event, startDate: '2026-09-10T12:00:00Z' }
    expect(selectMedTechEvents([
      later, { ...event, name: 'Yoga in the park' },
      { ...event, startDate: '2026-09-01T12:00:00Z' },
      { ...event, startDate: 'invalid' }, { ...event, url: 'javascript:alert(1)' },
      null, event,
    ], now)).toEqual([event, later])
  })

  it('provides an empty state and rejects malformed feeds', () => {
    expect(selectMedTechEvents([], now)).toEqual([])
    expect(() => selectMedTechEvents({}, now)).toThrow('unavailable')
  })

  it('uses the organization-scoped API for owned events, never a keyword search', () => {
    expect(MEDTECH_OWNED_EVENTS_PATH).toContain('/orgs/public/baltimore-medtech/events?')
    expect(MEDTECH_OWNED_EVENTS_PATH).toContain('upcoming_only=true')
    expect(selectOwnedMedTechEvents([event], now)).toEqual([])
    const hosted = { title: 'Community gathering', slug: 'gathering', starts_at: '2026-09-29T22:00:00Z' }
    expect(selectOwnedMedTechEvents([hosted, { ...hosted, starts_at: '2026-09-01T22:00:00Z' }], now)).toEqual([
      { name: 'Community gathering', startDate: hosted.starts_at, url: '/events/gathering', location: { name: '' }, imageUrl: undefined },
    ])
    expect(() => selectOwnedMedTechEvents({ error: 'unavailable' }, now)).toThrow('unavailable')
  })
})
