import {financialNodePies,financialNodeTotals,financialNodeCounterparties,foldFundNodes} from '../src/features/ecosystem/fund-pies.js'
import {createNetworkAnalysis} from '../src/features/ecosystem/network-analysis.js'
import {fiscalMatches} from '../src/features/ecosystem/transaction-time.js'
export function fiscalMetrics(data,year,compactPie){
 const selected=data.relationships.filter(row=>fiscalMatches(row,year)),annual=selected.filter(row=>row.annualAmountEligible!==false)
 const source={...data,relationships:annual,financing:[]},folded=foldFundNodes({...data,relationships:selected,financing:[]}),money=foldFundNodes(source)
 const graph=createNetworkAnalysis(folded.organizations,folded.relationships),financial=createNetworkAnalysis(money.organizations,money.relationships)
 const pies=financialNodePies(source),totals=financialNodeTotals(source),counterparties=financialNodeCounterparties(source),counts=new Map()
 for(const row of folded.relationships)for(const id of new Set([row.source,row.target]))counts.set(id,(counts.get(id)||0)+1)
 return new Map(folded.organizations.map(org=>[org.id,{pie:compactPie(pies.get(org.id)),contextPie:compactPie(pies.get(org.id)),totals:totals.get(org.id),counterparties:counterparties.get(org.id),incoming:financial.incoming.get(org.id)||0,outgoing:financial.outgoing.get(org.id)||0,connections:graph.adjacency.get(org.id)?.size||0,recordCount:counts.get(org.id)||0,amount:(financial.incoming.get(org.id)||0)+(financial.outgoing.get(org.id)||0),fiscalYear:year,obligations:false}]))
}
