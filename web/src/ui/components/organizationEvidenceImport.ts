export type EvidenceRecipient = {
  key: string; name: string; description: string; sourceUrl: string; tags: string[]; existingOrganizationId: string | null
  support: { supportKind: string; description: string; occurredAt: string; sourceUrl: string; evidence: string; notes: string; status: string }
}
export type EvidenceManifest = { reviewedAt: string; organizationId: string; coverage: string; recipients: EvidenceRecipient[] }
export type EvidencePreview = {
  previewId: string; expiresAt: string; changes: { organizationId: string; recipients: EvidenceRecipient[] }
  plan: { id: string; slug: string; tags: string[]; existing: { name: string } | null; record: unknown; row: EvidenceRecipient }[]
}
export type EvidenceRequest = (body: unknown) => Promise<unknown>
export function filterEvidenceRecipients(rows: EvidenceRecipient[], query: string, adjacentOnly: boolean) {
  const term = query.trim().toLocaleLowerCase()
  return rows.filter(row => (!adjacentOnly || row.tags.includes('LifeTech adjacent')) && row.name.toLocaleLowerCase().includes(term))
}
export async function previewEvidenceImport(manifest: EvidenceManifest, organizationId: string, request: EvidenceRequest) {
  if (manifest.organizationId !== organizationId) throw new Error('The research manifest belongs to another organization')
  const previews: EvidencePreview[] = []
  for (let offset = 0; offset < manifest.recipients.length; offset += 25) {
    const recipients = manifest.recipients.slice(offset, offset + 25)
    const result = await request({ organizationId, recipients, confirm: false }) as EvidencePreview
    if (!result.previewId || !result.expiresAt || !Array.isArray(result.plan) || result.plan.length !== recipients.length || !result.changes) throw new Error('Incomplete import preview')
    previews.push(result)
  }
  return previews
}
export async function applyEvidenceImport(previews: EvidencePreview[], request: EvidenceRequest, progress: (count: number) => void) {
  let count = 0
  for (const preview of previews) {
    await request({ ...preview.changes, confirm: true, previewId: preview.previewId })
    count += preview.changes.recipients.length
    progress(count)
  }
  return count
}
