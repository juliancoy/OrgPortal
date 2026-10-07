import { describe, expect, it } from 'vitest'
import { eventCalendarDateKey, isLifeTechMedicalEvent } from './medicalEvents'

describe('LifeTech medical relevance', () => {
  it('includes medical topics, support groups and LifeTech-hosted events', () => {
    for (const event of [
      { title: 'Techstars AI Health Baltimore Demo Day', tags: ['Health', 'LifeTech'] },
      { name: 'Breast Cancer Research Panel' },
      { name: 'Connection Recovery Support Group', source_group: 'NAMI Metro Baltimore Events' },
      { name: 'Life Tech Social [#2]' },
      { title: 'Community meetup', host_org_id: 'org-baltimore-medtech' },
      { name: 'Founders networking', tags: ['Biotech'] },
    ]) expect(isLifeTechMedicalEvent(event)).toBe(true)
  })
  it('excludes unrelated regional events and nonmedical LifeTech-tagged history', () => {
    for (const event of [
      { name: 'Public Ice Skating', tags: ['Community'] },
      { name: 'Microsoft Teams 365 & 2024' },
      { title: 'Market Pulse: Cyber Howard Challenge Pitch', tags: ['LifeTech', 'Pitch Practice', 'life-tech-event-history'] },
      { name: 'Yoga', tags: ['Health', 'Wellness'] },
      { name: 'Johns Hopkins alumni poetry night' },
    ]) expect(isLifeTechMedicalEvent(event)).toBe(false)
  })
})

describe('calendar event dates', () => {
  it('groups timestamps by Eastern date and preserves date-only events', () => {
    expect(eventCalendarDateKey('2026-10-08T01:30:00Z')).toBe('2026-10-07')
    expect(eventCalendarDateKey('2026-01-08T04:30:00Z')).toBe('2026-01-07')
    expect(eventCalendarDateKey('2026-10-08')).toBe('2026-10-08')
    expect(eventCalendarDateKey('invalid')).toBe('')
  })
})
