import { describe, expect, it } from 'vitest'
import { createVCard, vCardFileName } from './vcard'

describe('createVCard', () => {
  it('generates a downloadable vCard from contact data', () => {
    const card = createVCard(
      {
        user_name: 'Julian Coy',
        headline: 'Civic',
        bio: 'Code Collective',
        email_public: 'julian@example.test',
        phone_public: '+15551234567',
        website_url: 'https://codecollective.us',
        links: [{ label: 'Profile', url: 'https://codecollective.us/p/users/julian' }],
      },
      'https://codecollective.us/p/users/julian',
    )

    expect(card).toContain('BEGIN:VCARD')
    expect(card).toContain('VERSION:4.0')
    expect(card).toContain('FN:Julian Coy')
    expect(card).toContain('EMAIL;TYPE=internet:julian@example.test')
    expect(card).toContain('TEL;TYPE=cell:+15551234567')
    expect(card).toContain('item1.URL:https://codecollective.us/p/users/julian')
    expect(card).toContain('END:VCARD')
  })

  it('creates a safe vCard filename', () => {
    expect(vCardFileName('Julian Coy')).toBe('julian-coy.vcf')
  })
})
