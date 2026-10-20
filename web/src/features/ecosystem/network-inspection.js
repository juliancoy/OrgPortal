import {endpoint,financialEvidence} from './network-analysis.js'
export function applyNetworkFinancialSummary(panel,node,analysis){
 panel.querySelector('.eco-preview-totals')?.remove()
 const totals=document.createElement('dl');totals.className='eco-preview-totals';totals.setAttribute('aria-label','Recorded directed USD; payment unverified')
 for(const [label,value] of [['Recorded incoming USD',analysis.incoming.get(node.id)],['Recorded outgoing USD',analysis.outgoing.get(node.id)]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value===undefined?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);totals.append(dt,dd)}
 const heading=panel.querySelector('h2');if(heading)heading.after(totals);else panel.prepend(totals)
}
export function appendNetworkInspection(panel,node,analysis,edges,onClear){
 applyNetworkFinancialSummary(panel,node,analysis)
 const section=document.createElement('section'),heading=document.createElement('h3');heading.textContent='Organization records';section.append(heading);if(onClear){const close=document.createElement('button');close.type='button';close.textContent='Clear selection';close.addEventListener('click',onClear);section.prepend(close)}
 const info=document.createElement('p');info.textContent=`${node.id} · ${node.type||node.sector||node.category||'Type unavailable'} · ${[node.city,node.municipality,node.county,node.state].filter(Boolean).join(', ')||'Location unavailable'} · ${analysis.adjacency.get(node.id)?.size||0} connected organizations`;section.append(info)
 const format=value=>value===undefined?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value)
 const totals=document.createElement('p');totals.textContent=`Recorded incoming USD: ${format(analysis.incoming.get(node.id))}; outgoing USD: ${format(analysis.outgoing.get(node.id))}. Only disclosed directed USD records included; payment unverified.`;section.append(totals)
 const records=edges.filter(e=>endpoint(e.source)===node.id||endpoint(e.target)===node.id),summary=document.createElement('p');summary.textContent=`${records.length} relationship records`;section.append(summary)
 const list=document.createElement('ul');list.className='eco-relations';section.append(list);let cursor=0
 const more=document.createElement('button');more.type='button';more.textContent='Show more records'
 function add(){for(const edge of records.slice(cursor,cursor+30)){
  const evidence=financialEvidence(edge),other=endpoint(edge.source)===node.id?endpoint(edge.target):endpoint(edge.source),item=document.createElement('li'),title=document.createElement('strong')
  title.textContent=`${evidence.directed?(endpoint(edge.source)===node.id?'Outgoing to ':'Incoming from '):'Associated with '}${analysis.byId.get(other)?.name||other}`;item.append(title)
  const detail=document.createElement('p');detail.textContent=[edge.id,evidence.kind,edge.amountLabel||(evidence.amount===null?'Amount unavailable':format(evidence.amount)),edge.date||'Date unavailable',edge.status||'Status unavailable',edge.confidence===undefined?'':`Confidence: ${edge.confidence}`,edge.provenance?.sheet,edge.evidence,edge.description].filter(Boolean).join(' · ');item.append(detail)
  try{const url=new URL(edge.sourceUrl);if(['http:','https:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Underlying source';item.append(link)}}catch{/* Missing source is not inferred. */}
  list.append(item)
 }cursor+=30;more.hidden=cursor>=records.length}
 more.addEventListener('click',add);section.append(more);add();panel.append(section)
}
