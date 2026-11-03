import {budgetAppropriations} from './budget-appropriations.js'
import {endpoint,financialEvidence} from './network-analysis.js'
export function applyNetworkFinancialSummary(panel,node,analysis){
 panel.querySelector('.eco-preview-totals')?.remove()
 panel.querySelector('.eco-budget-appropriations')?.remove()
 panel.querySelector('.eco-government-members')?.remove()
 const totals=document.createElement('dl');totals.className='eco-preview-totals';totals.setAttribute('aria-label','Recorded directed USD; payment unverified')
 for(const [label,value] of [['Recorded incoming USD',analysis.incoming.get(node.id)],['Recorded outgoing USD',analysis.outgoing.get(node.id)]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value===undefined?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);totals.append(dt,dd)}
 const budgets=node.networkMetrics?.budgetAppropriations??[]
 appendBudgetAppropriations(panel,budgets)
 appendGovernmentMembers(panel,node)
 const heading=panel.querySelector('h2');if(heading)heading.after(totals);else panel.prepend(totals)
}
export function appendNetworkInspection(panel,node,analysis,edges,onClear){
 applyNetworkFinancialSummary(panel,node,analysis)
 if(!node.networkMetrics?.budgetAppropriations)appendBudgetAppropriations(panel,budgetAppropriations([node],edges).get(node.id))
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

export function appendBudgetAppropriations(panel,groups=[]){
 if(!groups.length)return
 panel.querySelector('.eco-budget-appropriations')?.remove()
 const section=document.createElement('section');section.className='eco-budget-appropriations'
 const heading=document.createElement('h3');heading.textContent='State budget funding';section.append(heading)
 const format=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value)
 for(const group of groups){
  const title=document.createElement('p');title.textContent=`FY${group.fiscalYear} · ${group.budgetStatus.replaceAll('_',' ')} · ${group.direction==='incoming'?'Incoming budget authority':'Outgoing budget authority'}: ${format(group.amount)}`;section.append(title)
  const list=document.createElement('ul');for(const fund of group.funds){const item=document.createElement('li');item.textContent=`${fund.name}: ${format(fund.amount)}`;list.append(item)}section.append(list)
 }
 const note=document.createElement('p');note.className='eco-note';note.textContent='Budget authority, not cash received or paid. Shown separately from recorded transactions. Coverage is limited to the imported operating-budget rows.';section.append(note);const anchor=panel.querySelector('.eco-preview-totals')||panel.querySelector('h2');if(anchor)anchor.after(section);else panel.append(section)
}

export function appendGovernmentMembers(panel,node){
 if(!node.governmentMembers?.length)return
 const section=document.createElement('section');section.className='eco-government-members'
 const title=document.createElement('h3');title.textContent='Maryland departments and budget agencies';section.append(title)
 const count=document.createElement('p');count.textContent=`All ${node.governmentMembers.length} entries in the FY2027 budget agency listing. The graph may show a relevance-ranked subset; choose more nodes to expand it.`;section.append(count)
 for(const [classification,label] of [['department','Departments'],['agency','Other agencies, offices and branches'],['budget_heading','Budget headings']]){
  const members=node.governmentMembers.filter(m=>m.classification===classification);if(!members.length)continue
  const details=document.createElement('details');details.open=classification==='department';const heading=document.createElement('summary');heading.textContent=`${label} (${members.length})`;details.append(heading)
  const list=document.createElement('ul');for(const member of members){const item=document.createElement('li'),link=document.createElement('a');link.textContent=member.name;link.href='/ecosystem/network?'+new URLSearchParams({org:member.id,direction:'children',panel:'inspector'});item.append(link);list.append(item)}details.append(list);section.append(details)
 }
 const source=document.createElement('a');source.textContent='Official Maryland agency directory';source.href='https://www.maryland.gov/your-government/state-agencies-and-departments';source.target='_blank';source.rel='noopener noreferrer';section.append(source)
 const anchor=panel.querySelector('.eco-budget-appropriations')||panel.querySelector('.eco-preview-totals')||panel.querySelector('h2');if(anchor)anchor.after(section);else panel.append(section)
}
