import {endpoint} from './network-analysis.js'
// Each fiscal year and budget status is a separate measure, never a payment total.
export function budgetAppropriations(nodes,edges){
 const result=new Map(nodes.map(n=>[n.id,[]])),seen=new Set()
 for(const edge of edges){
  if(edge.kind!=='appropriation'||edge.status==='voided'||edge.currency!=='USD'||!Number.isFinite(edge.amount)||!Number.isInteger(edge.fiscalYear)||!edge.budgetStatus||seen.has(edge.id))continue
  seen.add(edge.id)
  for(const [id,direction] of [[endpoint(edge.source),'outgoing'],[endpoint(edge.target),'incoming']]){
   if(!result.has(id))continue
   const rows=result.get(id);let group=rows.find(r=>r.fiscalYear===edge.fiscalYear&&r.budgetStatus===edge.budgetStatus&&r.direction===direction)
   if(!group){group={fiscalYear:edge.fiscalYear,budgetStatus:edge.budgetStatus,direction,amount:0,records:0,funds:[]};rows.push(group)}
   group.amount+=edge.amount;group.records++
   const name=edge.fundType||'Funding source unspecified';let fund=group.funds.find(f=>f.name===name)
   if(!fund){fund={name,amount:0};group.funds.push(fund)}fund.amount+=edge.amount
  }
 }
 for(const rows of result.values()){rows.sort((a,b)=>b.fiscalYear-a.fiscalYear||a.budgetStatus.localeCompare(b.budgetStatus)||a.direction.localeCompare(b.direction));for(const group of rows)group.funds.sort((a,b)=>a.name.localeCompare(b.name))}
 return result
}
