import { describe, expect, it } from 'vitest'
import { calendarFileName, createIcsEvent, outlookCalendarUrl } from './calendar'

describe('createIcsEvent', () => {
  it('generates a downloadable ICS event', () => {
    const ics = createIcsEvent({
      title: 'Portal Town Hall',
      description: 'Open member event',
      location: 'Union Hall',
      startsAt: '2026-08-12T18:00:00.000Z',
      endsAt: '2026-08-12T19:00:00.000Z',
      url: 'https://codecollective.us/p/events/portal-town-hall',
    })

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Portal Town Hall')
    expect(ics).toContain('DTSTART:20260812T180000Z')
    expect(ics).toContain('DTEND:20260812T190000Z')
    expect(ics).toContain('LOCATION:Union Hall')
    expect(ics).toContain('URL:https://codecollective.us/p/events/portal-town-hall')
    expect(ics).toContain('END:VCALENDAR')
  })

  it('creates a safe ICS filename', () => {
    expect(calendarFileName('Portal Town Hall')).toBe('portal-town-hall.ics')
  })

  it('builds an Outlook compose URL', () => {
    const url = outlookCalendarUrl({
      title: 'Portal Town Hall',
      description: 'Open member event',
      location: 'Union Hall',
      startsAt: '2026-08-12T18:00:00.000Z',
      endsAt: '2026-08-12T19:00:00.000Z',
      url: 'https://codecollective.us/p/events/portal-town-hall',
    })

    expect(url).toContain('outlook.live.com')
    expect(url).toContain('subject=Portal+Town+Hall')
    expect(url).toContain('startdt=2026-08-12T18%3A00%3A00Z')
    expect(url).toContain('location=Union+Hall')
  })
})
