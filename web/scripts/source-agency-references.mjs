// Resolve only reviewed source-system/dataset/code references. Names never identify organizations.
export function attachSourceAgencies(data, references) {
 const organizations = new Set(data.organizations.map(org => org.id)), lookup = new Map()
 for (const reference of references) {
  if (!organizations.has(reference.organizationId)) continue
  const key = JSON.stringify([reference.system, reference.dataset, reference.code])
  if (lookup.has(key) && lookup.get(key).organizationId !== reference.organizationId) throw Error('Ambiguous source agency reference')
  lookup.set(key, reference)
 }
 const relationships = data.relationships.map(row => {
  if (row.sourceRecordType !== 'external_financial_observation' || !row.sourceSystem || !row.sourceDataset) return row
  const reference = lookup.get(JSON.stringify([row.sourceSystem, row.sourceDataset, row.provenance?.agency_code]))
  // A native identity assignment takes precedence over source-code enrichment.
  if (!reference || row.sourceIdentityId) return row
  return {...row, source: reference.organizationId,
   sourceAgency: row.sourceAgency || {id:row.source, label:row.sourceLabel, code:row.provenance.agency_code, system:row.sourceSystem, dataset:row.sourceDataset},
   agencyAttachment: {method:'reviewed_source_code', organizationId:reference.organizationId, sourceUrl:reference.sourceUrl}}
 })
 const referenced = new Set(relationships.flatMap(row => [row.source,row.target]))
 const resolvedOrganizations=data.organizations.filter(org => org.entityType !== 'source_label' || referenced.has(org.id))
 return {...data, relationships, organizations:resolvedOrganizations, ...(data.transactionalCoverage?{transactionalCoverage:{...data.transactionalCoverage,unverifiedLabelNodes:resolvedOrganizations.filter(org=>org.identityStatus==='unverified_label').length}}:{})}
}
