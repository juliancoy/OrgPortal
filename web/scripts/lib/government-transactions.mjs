const sql = value => value == null ? 'NULL' : typeof value==='number' ? String(value) : `'${String(value).replaceAll("'","''")}'`
export function governmentTransactionsSql(evidence) {
 const statements=[]
 for(const r of evidence.relationships){
  const recipient=evidence.organizations.find(o=>o.id===r.target)
  // Only link IDs already belonging to production OrgPortal. Other official
  // identities remain available as labels and UEIs, without fabricated accounts.
  const values=[r.id,r.awardId,r.sourceLabel,r.targetLabel,recipient?.identifiers?.uei||null,r.recipientIdentity,null,recipient?.portalSlug?r.target:null,Math.round(r.amount*100),r.date,r.retrievedAt,r.sourceModifiedAt,evidence.coverage.start,evidence.coverage.end,r.sourceUrl,r.description,r.notes,JSON.stringify(r.provenance)]
  const columns=['id','award_identifier','agency_label','recipient_label','recipient_uei','recipient_identity','from_organization_id','to_organization_id','amount_cents','occurred_at','retrieved_at','source_modified_at','period_start','period_end','source_url','description','notes','provenance_json']
  // The organization may not yet exist in a local database. Preserve the record
  // with a nullable link; rerunning after replication establishes the link.
  const expressions=values.map((v,index)=>index===7&&v?`(SELECT id FROM organizations WHERE id=${sql(v)})`:sql(v))
  statements.push(`INSERT INTO government_award_records (${columns.join(',')}) VALUES (${expressions.join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.slice(1).map(c=>`${c}=excluded.${c}`).join(',')};`)
 }
 return statements.join('\n')+'\n'
}
