import { describe, expect, it } from 'vitest'
import { applyEvidenceImport, filterEvidenceRecipients, previewEvidenceImport, type EvidenceManifest, type EvidencePreview } from './organizationEvidenceImport'
const manifest: EvidenceManifest = { reviewedAt: '2026-10-05', organizationId: 'tedco', coverage: 'Named recipients', recipients: Array.from({ length: 51 }, (_, i) => ({
  key: `company-${i}`, name: `Company ${i}`, description: 'Company', sourceUrl: 'https://example.test', tags: i % 2 ? ['LifeTech adjacent'] : [], existingOrganizationId: null,
  support: { supportKind: 'transfer', description: 'Award', occurredAt: 'FY2025', sourceUrl: 'https://example.test', evidence: 'Named awardee', notes: '', status: 'reported' },
})) }
describe('reviewed evidence import', () => {
  it('preserves all recipients and applies the exact reviewed server payload in bounded batches', async () => {
    const requests: unknown[] = []
    const previews = await previewEvidenceImport(manifest, 'tedco', async body => {
      const changes = body as EvidencePreview['changes']; requests.push(body)
      return { previewId: `receipt-${requests.length}`, expiresAt: '2026-10-05T12:00:00Z', changes, plan: changes.recipients.map(row => ({ row })) }
    })
    expect(previews.map(p => p.changes.recipients.length)).toEqual([25,25,1])
    const applied: unknown[] = []; const progress: number[] = []
    expect(await applyEvidenceImport(previews, async body => { applied.push(body); return {} }, count => progress.push(count))).toBe(51)
    expect(progress).toEqual([25,50,51])
    expect(applied).toEqual(previews.map(p => ({ ...p.changes, confirm: true, previewId: p.previewId })))
  })
  it('stops at a failed batch and never applies remaining receipts', async () => {
    const previews = [1,2,3].map(i => ({ previewId: `${i}`, changes: { organizationId: 'tedco', recipients: manifest.recipients.slice(0,25) } })) as EvidencePreview[]
    let requests = 0; const progress: number[] = []
    await expect(applyEvidenceImport(previews, async () => { if (++requests === 2) throw new Error('Unauthorized'); return {} }, count => progress.push(count))).rejects.toThrow('Unauthorized')
    expect(requests).toBe(2); expect(progress).toEqual([25])
  })
  it('rejects a different supporting organization and incomplete previews', async () => {
    await expect(previewEvidenceImport(manifest, 'other', async () => ({}))).rejects.toThrow('another organization')
    await expect(previewEvidenceImport(manifest, 'tedco', async () => ({}))).rejects.toThrow('Incomplete')
  })
  it('keeps other sectors and searches across the complete recipient list', () => {
    expect(filterEvidenceRecipients(manifest.recipients, '', false)).toHaveLength(51)
    expect(filterEvidenceRecipients(manifest.recipients, ' COMPANY 5 ', false).map(r => r.key)).toEqual(['company-5','company-50'])
    expect(filterEvidenceRecipients(manifest.recipients, 'company 5', true).map(r => r.key)).toEqual(['company-5'])
  })
})
