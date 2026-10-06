// Pure, provider-independent normalization. Only these allowlisted fields are public.
export const categories = {
  ecosystem: 'LifeTech / MedTech ecosystem', company: 'Companies & ventures',
  health: 'Hospitals & health systems', university: 'Universities & research',
  'federal-government': 'Federal government', 'state-government': 'State government',
  funding: 'Funding & commercialization', general: 'General entrepreneurship',
}
export const semantics = {
  transfer: 'Documented funding / award', terms: 'Per-company program terms',
  capitalization: 'Fund capitalization', portfolio: 'Portfolio aggregate',
  coinvestment: 'Co-investment aggregate',
}
export const key = (s) => String(s || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : '' } catch { return '' }
}
// Government jurisdiction is independent of a funding role. Public universities
// and municipal/county bodies retain their existing classes.
export function governmentCategory(org) {
 const name=org.name || '', type=org.type || '', tags=org.tags || []
 let host='';try { host=new URL(org.website || org.source_url).hostname } catch {}
 if(tags.includes('Federal government') || /federal government|federal agency/i.test(type) || /^(?:National Institutes of Health|U\.?S\.? Economic Development Administration)(?:$| \()/i.test(name) || /(?:^|\.)(?:nih|eda)\.gov$/.test(host))return 'federal-government'
 if(tags.includes('State government') || /state government|state agency|state innovation funder/i.test(type) || /^(?:TEDCO(?:$| )|tedcomd\.com$|Maryland (?:Department|Commission|Port Administration|Port Commission)\b)/i.test(name) || /(?:^|\.)maryland\.gov$/.test(host) || /(?:^|\.)tedcomd\.com$/.test(host))return 'state-government'
 return null
}
export function applyGovernmentClasses(data) {
 for(const org of data.organizations)org.category=governmentCategory(org) || org.category
 return data
}
export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++ } else quoted = !quoted }
    else if (c === ',' && !quoted) { row.push(field); field = '' }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}
export function financeKind(...values) {
  const s = values.join(' ').toLowerCase()
  if (/co-invest/.test(s)) return 'coinvestment'
  if (/per (particip|company|selected|research)|per participant|cohort company|selected project|accelerator company|research awardee|researcher|up to|current program|current terms/.test(s)) return 'terms'
  if (/fund capital|fund size|fund raise|fund commitments|vc fund|lp commitment|into listed fund manager/.test(s)) return 'capitalization'
  if (/portfolio|aggregate|cumulative|current total|current reported total|research initiatives|blackbird investments|blackbird research/.test(s)) return 'portfolio'
  return 'transfer'
}
function classify(name, type, section) {
  if (/health system \/|^hospital/i.test(type)) return 'health'
  if (/university|academic|research institution/i.test(type)) return 'university'
  if (/company|startup|manufacturing resource|regulatory consulting|engineering \/|design \/|materials \/|prototyping/i.test(type) && !/accelerator|studio/i.test(type)) return 'company'
  if (/venture capital|venture fund|funder|investment arm/i.test(type)) return 'funding'
  if (/general entrepreneurship/i.test(section)) return 'general'
  if (/funding & commercialization/i.test(section)) return 'funding'
  return 'ecosystem'
}
export function normalizeWorkbook(tabs, registry, updatedAt) {
  for (const name of ['Sheet1', 'Dashboard', 'Financing & Money Flows', 'Funding Network']) {
    if (!Array.isArray(tabs[name]) || !tabs[name].length) throw new Error(`Missing worksheet: ${name}`)
  }
  const aliases = new Map(); const organizations = new Map()
  for (const r of registry) for (const alias of [r.name, ...(r.aliases || [])]) {
    if (aliases.has(key(alias)) && aliases.get(key(alias)) !== r.id) throw new Error(`Ambiguous alias: ${alias}`)
    aliases.set(key(alias), r.id)
  }
  const resolve = (name) => aliases.get(key(name)) || null
  let section = ''
  tabs.Sheet1.forEach((r, index) => {
    if (r[1] === 'Point of Contact') { section = r[0]; return }
    if (!r[0] || !safeUrl(r[3]) || !r[4] || !/^\d+$/.test(r[6] || '')) return
    const id = resolve(r[0]) || `org-${key(r[0])}`
    aliases.set(key(r[0]), id)
    const existing = organizations.get(id)
    if (existing) { existing.sourceRows.push(index + 1); return }
    // Named contact columns can contain private/stale personal addresses. Publish only
    // role mailboxes that match the organization's website; website is always available.
    const host = new URL(r[3]).hostname.replace(/^www\./, '')
    const emails = (r[2] || '').split(/[;,]/).map(s => s.trim()).filter(e => /^(info|hello|contact|sales|comms|office|support)@/i.test(e) && e.split('@')[1]?.toLowerCase() === host)
    organizations.set(id, { id, name: r[0], category: governmentCategory({name:r[0],type:r[4],website:r[3]}) || classify(r[0], r[4], section), sourceCategory: section,
      type: r[4], website: safeUrl(r[3]), publicEmails: emails, relevance: r[5] || '',
      proximity: Math.min(100, Math.max(0, Number(r[6]))), sourceRows: [index + 1], directory: true })
  })
  // Explicit entities from funding sources keep funds and programs distinct from parents.
  for (const r of registry) if (!organizations.has(r.id) && r.supplemental) organizations.set(r.id, {
    id: r.id, name: r.name, category: governmentCategory(r) || r.category, type: r.type || 'Funding-network organization',
    website: safeUrl(r.website), publicEmails: [], relevance: r.relevance || '', proximity: r.proximity ?? null,
    sourceRows: [], directory: r.directory === true, ...(r.sourceCategory ? { sourceCategory: r.sourceCategory } : {}),
  })
  const dashboard = tabs.Dashboard.filter(r => resolve(r[0]) && r[3]).map(r => ({ organizationId: resolve(r[0]), contribution: r[3], sourceCategory: r[2] }))
  const financing = tabs['Financing & Money Flows'].slice(1).filter(r => r[0] && r[1] && r[2]).map((r, i) => ({
    id: `fin-${key([r[0], r[1], r[2], r[3], r[4]].join('-'))}`, recipient: r[0], funder: r[1],
    recipientId: resolve(r[0]), funderId: resolve(r[1]), amountLabel: r[2], amount: Number(r[2].replace(/[$,]/g, '')) || null,
    date: r[3], type: r[4], scope: r[5], evidence: r[6], notes: r[7], sourceUrl: safeUrl(r[8]),
    kind: financeKind(...r.slice(0, 8)), provenance: { sheet: 'Financing & Money Flows', row: i + 2 },
  }))
  const relationships = tabs['Funding Network'].slice(2).filter(r => r[0] && r[1]).map((r, i) => {
    const kind = financeKind(...r.slice(0, 6))
    const match = financing.find(f => f.amountLabel === r[2] && f.sourceUrl === safeUrl(r[6]) && (f.funderId === resolve(r[0]) || f.funder === r[0]))
    return { id: `edge-${key([r[0], r[1], r[2], r[3], r[4]].join('-'))}`, source: resolve(r[0]), target: resolve(r[1]),
      sourceLabel: r[0], targetLabel: r[1], relationship: kind === 'terms' ? 'acceleration' : 'funding', kind,
      amountLabel: r[2], amount: Number((r[2] || '').replace(/[$,]/g, '')) || null,
      type: r[3], date: r[4], description: r[5], sourceUrl: safeUrl(r[6]), evidence: match?.evidence || 'Source linked in Funding Network',
      notes: match?.notes || '', financingId: match?.id || null, provenance: { sheet: 'Funding Network', row: i + 3 } }
  })
  // Curated relations must reference actual rows and their public website/evidence.
  for (const r of registry) for (const link of r.relationships || []) {
    const source = organizations.get(r.id), target = organizations.get(link.target)
    if (!source || !target) continue
    relationships.push({ id: `rel-${r.id}-${link.target}-${link.type}`, source: r.id, target: target.id,
      sourceLabel: source.name, targetLabel: target.name, relationship: link.type, kind: null,
      amount: null, amountLabel: '', date: '', type: link.label, description: link.label, notes: '',
      sourceUrl: safeUrl(link.sourceUrl || source.website), evidence: 'Directory affiliation / program description',
      provenance: { sheet: 'Sheet1', row: source.sourceRows[0] || null } })
  }
  if (!organizations.size || !financing.length || !relationships.length) throw new Error('Workbook structure changed or source is empty')
  return { schemaVersion: 1, updatedAt, source: 'LifeTech Associates', organizations: [...organizations.values()].sort((a,b) => (b.proximity ?? -1) - (a.proximity ?? -1) || a.name.localeCompare(b.name)), dashboard, financing, relationships }
}
