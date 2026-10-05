import { describe, expect, it } from 'vitest'
import { needsPublishedTedcoRoster, type RecipientReport } from './tedcoRecipientReport'
const report = (length: number) => ({ manifest: { recipients: Array.from({ length }, () => ({})) } }) as RecipientReport
describe('published TEDCO recipient visibility', () => {
  it('retains the reviewed roster when the primary database has not imported it', () => {
    expect(needsPublishedTedcoRoster('org-tedco', report(0), 578)).toBe(true)
    expect(needsPublishedTedcoRoster('org-tedco', report(25), 578)).toBe(true)
    expect(needsPublishedTedcoRoster('org-tedco', report(578), 578)).toBe(false)
    expect(needsPublishedTedcoRoster('another-organization', report(0), 578)).toBe(false)
  })
})
