import { describe, expect, it } from 'vitest'
import { externalEventListings } from './externalEventListings'

describe('external event listings', () => {
  it('prioritizes the source and preserves its enriched preview', () => {
    const source = { url: 'https://meetup.com/event', title: 'Original title', image_url: 'https://meetup.com/image.jpg' }
    expect(externalEventListings({ source_url: source.url, links: [{ url: 'https://example.com/other' }, source] }, 'https://lifetech.fyi')).toEqual([source, { url: 'https://example.com/other' }])
  })
  it('filters internal, unsafe, invalid and duplicate links', () => {
    expect(externalEventListings({ source_url: 'https://example.com/event', links: [
      { url: 'https://lifetech.fyi/events/test' }, { url: 'javascript:alert(1)' }, { url: '/events/test' }, { url: 'https://example.com/event' },
    ] }, 'https://lifetech.fyi')).toEqual([{ url: 'https://example.com/event' }])
  })
})
