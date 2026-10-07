import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { EventVenues, type Venue } from './EventVenues'

vi.mock('../../app/AppProviders', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('./VenueVotes', () => ({ VenueVotes: () => createElement('div', null, 'Candidate voting') }))
vi.mock('./VenueSearch', () => ({ VenueSearch: () => createElement('div', null, 'Find venues') }))
const candidate: Venue = { id: 'candidate', name: 'Candidate brewery', status: 'active', event_status: 'candidate' }
const confirmed: Venue = { id: 'confirmed', name: 'Selected venue', status: 'active', event_status: 'confirmed' }
const render = (venues: Venue[], canManage = false) => renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(EventVenues, { eventId: 'event', venues, canManage, onSaved: () => {} })),
)
describe('event venue selection', () => {
  it('shows voting before confirmation and exposes confirmation only to organizers', () => {
    expect(render([candidate])).toContain('Candidate voting')
    expect(render([candidate])).not.toContain('Confirm venue')
    expect(render([candidate], true)).toContain('Confirm venue')
  })
  it('replaces candidate voting and search with the confirmed venue for visitors', () => {
    const html = render([candidate, confirmed])
    expect(html).toContain('Selected venue')
    expect(html).not.toContain('Candidate brewery')
    expect(html).not.toContain('Candidate voting')
    expect(html).not.toContain('Find venues')
    expect(html).not.toContain('Reopen venue voting')
  })
  it('lets organizers change the venue or reopen voting after confirmation', () => {
    const html = render([candidate, confirmed], true)
    expect(html).toContain('Change confirmed venue')
    expect(html).toContain('Reopen venue voting')
    expect(html).not.toContain('Candidate voting')
  })
})
