import { expect, test } from 'vitest'
import { agencyExpenditure, fundingGroup, rankFunding, type FundingReport, type FundingRow } from './fundingDashboard'
const row:FundingRow={direction:'deployed',currency:'USD',status:'reported',financialFactType:'reported_award',measurement:'cumulative',amount:10,name:'Small',recordCount:1,undisclosedCount:0,lowerBoundCount:0}
test('ranks the largest recipient first and excludes other currencies, periods and statuses',()=>{
 const rows=[row,{...row,name:'Unknown',amount:null},{...row,name:'Largest',amount:100},{...row,currency:'EUR',amount:500},{...row,status:'delivered',amount:500},{...row,fiscalYear:2025,amount:500},{...row,direction:'received' as const,amount:500}]
 expect(rankFunding(rows,'deployed',fundingGroup(row)).map(item=>item.name)).toEqual(['Largest','Small','Unknown'])
 expect(rows[0].name).toBe('Small')
})
test('agency totals exclude other years, appropriations, component facts, voided evidence and duplicates',()=>{
 const fact={id:'a',support_record_id:'record',fact_type:'agency_expenditure',scope:'agency',amount:50,currency:'USD',fiscal_year:2025,included_in_fact_id:null,source_url:'https://source.test'}
 const report:FundingReport={organization:{id:'state',slug:'state',name:'State'},financialTotals:{entries:[],counterparties:[]},records:[{record_id:'record',from_organization_id:'state',to_organization_id:'agency',to_organization_slug:'agency',to_label:'Agency',status:'reported'}],fundingFacts:{nextOffset:null,records:[fact,fact,{...fact,id:'old',fiscal_year:2024},{...fact,id:'planned',fact_type:'appropriation'},{...fact,id:'component',included_in_fact_id:'a'}]}}
 expect(agencyExpenditure(report,2025)).toEqual([{name:'Agency',slug:'agency',amount:50,source:'https://source.test'}])
 report.records[0].status='voided'
 expect(agencyExpenditure(report,2025)).toEqual([])
})
