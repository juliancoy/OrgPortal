import {endpoint,financialEvidence} from './network-analysis.js'
export function applyNetworkFinancialSummary(panel,node,analysis){
 panel.querySelector('.eco-preview-totals')?.remove()
 const totals=document.createElement('dl');totals.className='eco-preview-totals';totals.setAttribute('aria-label','Recorded directed USD; payment unverified')
 for(const [label,value] of [['Recorded incoming USD',analysis.incoming.get(node.id)],['Recorded outgoing USD',analysis.outgoing.get(node.id)]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value===undefined?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);totals.append(dt,dd)}
 panel.querySelector('.eco-fiscal-context')?.remove();if(node.networkMetrics?.fiscalYear){const note=document.createElement('p');note.className='eco-note eco-fiscal-context';note.textContent=node.networkMetrics.fiscalYear==='unassigned'?'Unassigned source fiscal year':`FY${node.networkMetrics.fiscalYear} · Source fiscal calendar. Lifetime cumulative obligations excluded.`;panel.prepend(note)}
 const heading=panel.querySelector('h2');if(heading)heading.after(totals);else panel.prepend(totals)
}
export function appendNetworkInspection(panel,node,analysis,edges,onClear,{loadEvidence}={}){
 applyNetworkFinancialSummary(panel,node,analysis)
 if(node.visualGroup?.length){const note=document.createElement('p');note.className='eco-note';note.textContent=`Visual group · ${node.visualGroup.length} organization records. Enable “Separate visual duplicates” in controls to show them individually.`;panel.append(note)}
 const section=document.createElement('details'),heading=document.createElement('summary');section.className='eco-organization-records';heading.textContent='Organization records';section.append(heading);if(onClear){const close=document.createElement('button');close.type='button';close.textContent='Clear selection';close.addEventListener('click',onClear);panel.append(close)}
 if(node.visualGroup){const members=document.createElement('ul');for(const member of node.visualGroup){const item=document.createElement('li');item.textContent=member.name+' · '+member.id;members.append(item)}section.append(members)}
 const info=document.createElement('p');info.textContent=`${node.id} · ${node.type||node.sector||node.category||'Type unavailable'} · ${[node.city,node.municipality,node.county,node.state].filter(Boolean).join(', ')||'Location unavailable'} · ${analysis.adjacency.get(node.id)?.size||0} connected organizations`;section.append(info)
 const format=value=>value===undefined?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value)
 const totals=document.createElement('p');totals.textContent=`Recorded incoming USD: ${format(analysis.incoming.get(node.id))}; outgoing USD: ${format(analysis.outgoing.get(node.id))}. Only disclosed directed USD records included; payment unverified.`;section.append(totals)
 let records=edges.filter(e=>endpoint(e.source)===node.id||endpoint(e.target)===node.id),summary=document.createElement('p');summary.textContent=`${records.length} relationship records`;section.append(summary)
 const sources=[...new Set(records.map(edge=>edge.attribution).filter(Boolean))];if(sources.length){const attribution=document.createElement('p');attribution.className='eco-note';attribution.textContent='Sources: '+sources.join(' · ');panel.append(attribution)}
 const list=document.createElement('ul');list.className='eco-relations';section.append(list);let cursor=0
 const more=document.createElement('button');more.type='button';more.textContent='Show more records'
 function add(){for(const edge of records.slice(cursor,cursor+30)){
  const evidence=financialEvidence(edge),other=endpoint(edge.source)===node.id?endpoint(edge.target):endpoint(edge.source),item=document.createElement('li'),title=document.createElement('strong')
  title.textContent=`${evidence.directed?(endpoint(edge.source)===node.id?'Outgoing to ':'Incoming from '):'Associated with '}${analysis.byId.get(other)?.name||(endpoint(edge.source)===node.id?edge.targetLabel:edge.sourceLabel)||other}`;item.append(title)
  const detail=document.createElement('p');detail.textContent=[edge.id,evidence.kind,edge.amountLabel||(evidence.amount===null?'Amount unavailable':format(evidence.amount)),edge.date||(edge.periodStart&&edge.periodEnd?edge.periodStart+' through '+edge.periodEnd:'Date unavailable'),edge.datePrecision?`Precision: ${edge.datePrecision}`:'',edge.dateBasis||'',edge.status||'Status unavailable',edge.confidence===undefined?'':`Confidence: ${edge.confidence}`,edge.provenance?.sheet,edge.evidence,edge.description,edge.notes].filter(Boolean).join(' · ');item.append(detail)
  try{const url=new URL(edge.sourceUrl);if(['http:','https:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Underlying source';item.append(link)}}catch{/* Missing source is not inferred. */}
  list.append(item)
 }cursor=Math.min(records.length,cursor+30);more.hidden=cursor>=records.length}
 let next,loading=false,started=false,controller
 const status=document.createElement('p');status.setAttribute('role','status');section.append(status)
 async function fetchEvidence(){
  if(loading)return;loading=true;more.disabled=true;controller=new AbortController();status.textContent='Loading evidence…'
  try{const page=await loadEvidence(next,{signal:controller.signal});if(controller.signal.aborted)return;if(!started){records=[];cursor=0;list.replaceChildren()}started=true;more.textContent='Show more records';const seen=new Set(records.map(edge=>edge.id));records.push(...page.records.filter(edge=>!seen.has(edge.id)));next=page.next;add();summary.textContent=`${records.length} evidence records loaded`;more.hidden=!next;status.textContent=next?'More evidence available.':'Evidence loaded.'}
  catch(error){if(error.name!=='AbortError'){status.textContent=error.message||'Evidence unavailable. Please retry.';more.hidden=false;more.textContent='Retry loading evidence'}}
  finally{loading=false;more.disabled=false}
 }
 more.addEventListener('click',()=>{if(loadEvidence)void fetchEvidence();else add()});section.append(more)
 if(loadEvidence){more.hidden=true;status.textContent='Source attribution is shown above. Expand to load evidence.';section.addEventListener('toggle',()=>{if(section.open&&!started)void fetchEvidence();else if(!section.open&&loading)controller?.abort()})}else add()
 panel.append(section)
}
