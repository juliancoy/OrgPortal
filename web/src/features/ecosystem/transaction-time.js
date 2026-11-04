const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===value.slice(0,10)
export function transactionTime(row){
 const date=row.date||row.occurred_at||row.transactionDate||'',start=row.periodStart||row.period_start||'',end=row.periodEnd||row.period_end||''
 let calendar=row.fiscalCalendar||'unknown';const id=row.id||row.awardKey||''
 let host='';try{host=new URL(row.sourceUrl||row.source_url).hostname}catch{}
 if(/^md-(view|bpw):/.test(id)||host.endsWith('.marylandtaxes.gov')||host==='marylandtaxes.gov'||host==='maryland.gov'||host.endsWith('.maryland.gov')||host==='marylandcomptroller.gov'||host.endsWith('.marylandcomptroller.gov'))calendar='maryland'
 if(/^(usaspending:|usgov:)/.test(id)||host==='usaspending.gov'||host.endsWith('.usaspending.gov'))calendar='federal'
 const explicit=Number(String(row.fiscalYear||row.fiscal_year||row.reportingFiscalYear||row.reporting_fiscal_year||row.provenance?.fiscalYear||row.provenance?.fiscal_year||'').replace(/^FY\s*/i,'')),hasPeriod=day(start)&&day(end)&&start<=end
 let year=Number.isInteger(explicit)&&explicit>=1900&&explicit<=2200?explicit:null
 if(!year&&hasPeriod&&['maryland','federal'].includes(calendar)){const boundary=calendar==='maryland'?7:10,fy=value=>Number(value.slice(0,4))+(Number(value.slice(5,7))>=boundary?1:0);if(fy(start)===fy(end))year=fy(end)}
 if(!year&&hasPeriod&&Date.parse(end)-Date.parse(start)<=366*86400000&&calendar==='unknown'){year=Number(end.slice(0,4));calendar='reported'}
 if(!year&&day(date)&&['maryland','federal'].includes(calendar)){const month=Number(date.slice(5,7));year=Number(date.slice(0,4))+(month>=(calendar==='maryland'?7:10)?1:0)}
 const measure=String(row.financialMeasure||row.financial_measurement||row.measurement||'')
 const reporting=hasPeriod&&/nonprofit|period_total/.test(String(row.sourceRecordType||row.record_type||'')+' '+measure)
 return {fiscalYear:year,fiscalCalendar:calendar,datePrecision:reporting?'period':day(date)?date.includes('T')?'timestamp':'day':hasPeriod?'period':/^\d{4}-\d{2}$/.test(date)?'month':/^\d{4}$/.test(date)?'year':year?'fiscal-year':'unknown',dateBasis:reporting?'source reporting period; event date not supplied':day(date)?'source transaction date':hasPeriod?'source reporting period':year?'source fiscal year':'source date unavailable',periodStart:hasPeriod?start:row.periodStart,periodEnd:hasPeriod?end:row.periodEnd,annualAmountEligible:!(/cumulative|lifetime/i.test(measure))}
}
export const fiscalMatches=(time,year)=>{const assigned=typeof time==='number'?time:time?.fiscalYear;return !year||year==='all'||(year==='unassigned'?!assigned:String(assigned)===String(year))}
const cache=new WeakMap()
export function fiscalTopology(topology,year){
 if(!year||year==='all')return topology
 let years=cache.get(topology);if(!years){years=new Map();cache.set(topology,years)}if(years.has(year)){const hit=years.get(year);years.delete(year);years.set(year,hit);return hit}
 const nodeId=value=>typeof value==='number'?topology.nodeIds[value]:value,adjacency=Object.fromEntries((topology.nodeIds||Object.keys(topology.adjacency||{})).map(id=>[id,new Set()])),edgesByOrg={}
 topology.edges.forEach((edge,index)=>{if(!fiscalMatches(edge[4],year))return;const a=nodeId(edge[0]),b=nodeId(edge[1]);for(const [id,other] of [[a,b],[b,a]])(adjacency[id]??=new Set()).add(other);for(const id of new Set([a,b]))(edgesByOrg[id]??=[]).push(index)})
 const result={...topology,adjacency:Object.fromEntries(Object.entries(adjacency).map(([id,neighbors])=>[id,[...neighbors]])),edgesByOrg,degree:Object.fromEntries(Object.entries(adjacency).map(([id,n])=>[id,n.size]))};years.set(year,result);while(years.size>2)years.delete(years.keys().next().value);return result
}
export function dateCoverage(rows){const counts={total:rows.length,timestamp:0,day:0,period:0,month:0,year:0,'fiscal-year':0,unknown:0,assignedFiscalYear:0};for(const row of rows){const time=transactionTime(row);counts[time.datePrecision]++;if(time.fiscalYear)counts.assignedFiscalYear++}return counts}
