import { applyFundHierarchy, financialNodePies, pieWedgePath, formatPieAmount } from './fund-pies.js'
import { categories, semantics, safeUrl } from './ecosystem.js'
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const e = escapeHtml
export const evidenceLink = (url, label = 'View source ↗') => safeUrl(url) ? `<a href="${e(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : '<span>Source not supplied</span>'
export const organizationPagePath = org => `/orgs/${encodeURIComponent(org.portalSlug || org.id.replace(/^org-/, ''))}`
export function organizationPicture(org) {
 const image=safeUrl(org.imageUrl)
 return image ? `<figure class="eco-inspector-picture"><img src="${e(image)}" alt="Published image for ${e(org.name)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>${e(org.name)}${org.imageCaption ? ` · ${e(org.imageCaption)}` : ''} · ${evidenceLink(org.imageSourceUrl || org.website,'Image source ↗')}</figcaption></figure>` : '<p class="eco-note">No published picture supplied.</p>'
}
export function edgeDetails(edge,data) {
 const id=value=>typeof value==='object'?value?.id:value
 const organizations=[edge.source,edge.target].map(value=>data.organizations.find(o=>o.id===id(value))).filter(Boolean)
 return `<p class="eco-eyebrow">Relationship preview</p><h2>${e(edge.sourceLabel)} → ${e(edge.targetLabel)}</h2>
 ${safeUrl(edge.imageUrl) ? `<figure class="eco-inspector-picture"><img src="${e(safeUrl(edge.imageUrl))}" alt="Published relationship image" loading="lazy" referrerpolicy="no-referrer"><figcaption>${evidenceLink(edge.sourceUrl,'Image source ↗')}</figcaption></figure>` : organizations.map(org=>`<h3>${e(org.name)}</h3>${organizationPicture(org)}`).join('')}
 <p><strong>${e(edge.type || edge.description || edge.relationship)}</strong></p>
 <p>${e(semantics[edge.kind] || edge.relationship)}${edge.amountLabel ? ` · ${e(edge.amountLabel)}` : ''}${edge.date ? ` · ${e(edge.date)}` : ''}</p>
 <p>${e(edge.evidence || 'Evidence description not supplied.')}</p><p>${e(edge.notes || edge.description || '')}</p>
 <p>${evidenceLink(edge.sourceUrl)}</p><p class="eco-note">${e(edge.provenance?.sheet || 'Public evidence')}${edge.provenance?.row ? ` · row ${e(edge.provenance.row)}` : ''}${edge.status ? ` · ${e(edge.status)}` : ''}. Awards and commitments do not establish payment. Organization pictures identify the endpoints, not the transaction.</p>`
}
export function orgDetails(org, data, options = {}) {
  applyFundHierarchy(data)
  const funds=data.organizations.filter(o=>o.administratorId===org.id), family=new Set([org.id,...funds.map(o=>o.id)])
  const relations = data.relationships.filter(r => family.has(r.source) || family.has(r.target))
  const money = data.financing.filter(f => family.has(f.funderId) || family.has(f.recipientId))
  const pie=financialNodePies(data,options).get(org.id)
  const events=(data.events || []).filter(event=>event.organizationId===org.id)
  const dashboard = data.dashboard.find(d => d.organizationId === org.id)
  return `<p class="eco-eyebrow">${e(categories[org.category])}</p><h2>${e(org.name)}</h2>${organizationPicture(org)}<p>${e(org.type)}</p>
  <p>${e(org.relevance || 'Included in the documented funding network; proximity has not been scored.')}</p>
  <p><strong>LifeTech proximity:</strong> ${org.proximity == null ? 'Not scored' : `${org.proximity}/100`}</p>
  ${dashboard ? `<p><strong>Dashboard contribution:</strong> ${e(dashboard.contribution)}</p>` : ''}
  ${org.directory ? `<p><a href="${organizationPagePath(org)}">Organization page →</a></p>` : ''}
  <p>${org.website ? evidenceLink(org.website, 'Organization website ↗') : 'Website not listed'}</p>
  ${org.publicEmails.map(email => `<p><a href="mailto:${e(email)}">${e(email)}</a></p>`).join('')}
  ${funds.length ? `<section aria-label="Administered funds"><h3>Funds within ${e(org.name)}</h3><ul class="eco-relations">${funds.map(f=>`<li><strong>${e(f.name)}</strong><small>Fund administered by ${e(org.name)}${f.fundUmbrella ? ` · ${e(f.fundUmbrella)} umbrella` : ''}</small>${evidenceLink(f.administrationSourceUrl,'Fund administration source ↗')}</li>`).join('')}</ul></section>` : ''}
  ${fundingPieDetails(pie)}
  <h3>Events${Array.isArray(data.events) ? ` <span>${events.length}</span>` : ''}</h3><p><a href="/ecosystem/network/events?org=${encodeURIComponent(org.id)}">Browse events for this organization →</a></p>
  <h3>Documented relationships <span>${relations.length}</span></h3>
  ${relations.length ? `<ul class="eco-relations">${relations.map(r => `<li><strong>${e(r.sourceLabel)} → ${e(r.targetLabel)}</strong><span>${e(r.type)}${r.amountLabel ? ` · ${e(r.amountLabel)}` : ''}</span><small>${e(semantics[r.kind] || r.relationship)}${r.date ? ` · ${e(r.date)}` : ''}</small><p>${e(r.notes || r.description)}</p>${evidenceLink(r.sourceUrl)}<small>${e(r.evidence)}${r.status ? ` · ${e(r.status==='reported'?(r.kind==='transfer'?'Reported award/funding; payment unverified':'Reported support'):r.status)}` : ''} · ${e(r.provenance.sheet)}${r.provenance.row ? `, row ${r.provenance.row}` : ''}</small></li>`).join('')}</ul>` : '<p>No relationship recorded. This does not mean none exists.</p>'}
  <h3>Financing & money flows <span>${money.length}</span></h3>
  ${money.length ? `<ul class="eco-relations">${money.map(f => `<li><strong>${e(f.funder)} → ${e(f.recipient)}</strong><span>${e(f.amountLabel)} · ${e(f.type)}</span><small>${e(semantics[f.kind])} · ${e(f.date)}</small><p>${e(f.notes)}</p>${evidenceLink(f.sourceUrl)}<small>${e(f.evidence)} · Financing & Money Flows, row ${f.provenance.row}</small></li>`).join('')}</ul>` : '<p>No separate financing record supplied.</p>'}
  <p class="eco-note">Source: ${e(org.sourceCategory || 'LifeTech Associates')}${org.sourceCategory === 'LifeTech curated addition' ? '' : org.sourceRows.length ? `, directory rows ${org.sourceRows.join(', ')}` : ', Funding Network'}. Personal contact columns are withheld; only matching organization role mailboxes are published.</p>`
}
export function relationshipTable(data) {
 return `<div class="eco-table-scroll"><table class="eco-table"><caption>All source relationships, including program terms and aggregate scopes</caption><thead><tr><th scope="col">Source → recipient / scope</th><th scope="col">Relationship</th><th scope="col">Amount / meaning</th><th scope="col">Evidence</th></tr></thead><tbody>${data.relationships.map(r=>`<tr data-source="${e(r.source || '')}" data-target="${e(r.target || '')}" data-kind="${e(r.kind || r.relationship)}" data-relationship="${e(r.relationship)}"><td>${e(r.sourceLabel)}<br>→ ${e(r.targetLabel)}</td><td>${e(r.type)}<small>${e(r.date)}</small></td><td>${e(r.amountLabel || '—')}<small>${e(semantics[r.kind] || r.relationship)}</small>${r.notes ? `<small>${e(r.notes)}</small>` : ''}</td><td>${evidenceLink(r.sourceUrl)}<small>${e(r.evidence)}</small><small>${e(r.provenance.sheet)}${r.provenance.row ? ` · row ${r.provenance.row}` : ''}</small></td></tr>`).join('')}</tbody></table></div>`
}
export function financingTable(data) {
 return `<div class="eco-table-scroll"><table class="eco-table"><caption>Financing & Money Flows — separate source records, not an additive transaction ledger</caption><thead><tr><th scope="col">Funder → recipient / vehicle</th><th scope="col">Amount / classification</th><th scope="col">Period & scope</th><th scope="col">Evidence & caveats</th></tr></thead><tbody>${data.financing.map(f=>`<tr><td>${e(f.funder)}<br>→ ${e(f.recipient)}</td><td><strong>${e(f.amountLabel)}</strong><small>${e(semantics[f.kind])}</small><small>${e(f.type)}</small></td><td>${e(f.date)}<small>${e(f.scope)}</small></td><td>${evidenceLink(f.sourceUrl)}<small>${e(f.evidence)} · row ${f.provenance.row}</small><small>${e(f.notes)}</small></td></tr>`).join('')}</tbody></table></div>`
}

export function proximityChart(organizations) {
 const sorted = [...organizations].sort((a,b) => (b.proximity ?? -1) - (a.proximity ?? -1) || a.name.localeCompare(b.name))
 return `<section class="eco-proximity" aria-labelledby="proximity-heading"><h2 id="proximity-heading">LifeTech proximity, at a glance.</h2><p>Curated relevance to LifeTech, scored out of 100—not a quality rating. Highest scores first. Search and filters above update this chart. Select an organization to open its details.</p><div class="eco-bar-axis" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div><div class="eco-bar-scroll" tabindex="0" role="region" aria-label="Organization proximity chart, scroll for all organizations"><ol class="eco-bars">${sorted.map(o => `<li data-org="${e(o.id)}"><a class="eco-bar-row" href="#${e(o.id)}" data-class="${e(o.category)}"><span class="eco-bar-name">${e(o.name)}<small>${e(categories[o.category])}</small></span><span class="eco-bar-track" aria-hidden="true">${o.proximity == null ? '<span class="eco-bar-missing">Not scored</span>' : `<span class="eco-bar-fill" style="width:${Math.max(0,Math.min(100,o.proximity))}%"></span>`}</span><strong>${o.proximity == null ? 'Not scored' : `${o.proximity}/100`}</strong></a></li>`).join('')}</ol></div><p class="eco-note">Source: LifeTech Associates directory. Missing scores are labeled “Not scored”; they are never treated as zero.</p></section>`
}

export function fundingPieDetails(pie) {
 if(!pie)return '<p class="eco-note">No disclosed USD amounts available for a funding pie.</p>'
 return `<section class="eco-fund-breakdown" aria-label="Funding pie breakdown"><h3>${e(pie.basis)}</h3><svg viewBox="-52 -52 104 104" role="img" aria-label="Funding proportions; amounts listed below">${pie.slices.map(s=>`<path d="${pieWedgePath(0,0,50,s.startAngle,s.endAngle)}" fill="${e(s.color)}"><title>${e(s.label)}: ${e(formatPieAmount(s.amount))} · ${(s.share*100).toFixed(1)}%</title></path>`).join('')}</svg><ul class="eco-relations">${pie.slices.map(s=>`<li><strong><span class="eco-fund-swatch" style="background:${e(s.color)}"></span>${e(s.label)}</strong><span>${e(formatPieAmount(s.amount))} · ${(s.share*100).toFixed(1)}%</span>${s.records.map(r=>`<small>${e(r.type || r.description)} · ${e(r.date)} · ${e(formatPieAmount(r.amount))}</small>${evidenceLink(r.sourceUrl)}`).join('')}</li>`).join('')}</ul><p class="eco-note">Slices compare disclosed USD awards across recorded dates, not fund size, available cash or a complete budget. Receipts and onward awards are shown separately. Payment is unverified.${pie.omitted ? ` ${pie.omitted} undisclosed or non-USD records excluded from proportions.` : ''}</p></section>`
}
