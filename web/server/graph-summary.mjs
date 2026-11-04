export function sourceAttribution(edge){
 if(edge.attribution)return edge.attribution
 if(edge.id?.startsWith('md-bpw:'))return 'Maryland Board of Public Works'
 if(edge.id?.startsWith('md-view:'))return 'Maryland Comptroller'
 try{const host=new URL(edge.sourceUrl).hostname.replace(/^www\./,'');if(host==='interactive2.marylandtaxes.gov'||host==='marylandtaxes.gov')return 'Maryland Comptroller';if(host==='bpw.maryland.gov')return 'Maryland Board of Public Works';if(host.endsWith('usaspending.gov'))return 'USAspending.gov';return host}catch{return edge.sourceRecordType?.replaceAll('_',' ')||'Public source'}
}
export function graphSummary(edge){
 const keys=['id','source','target','sourceLabel','targetLabel','kind','relationship','amount','currency','amountLabel','date','status','financialMeasure','financialFactType','measurement','periodStart','periodEnd','quantity','unit','directional','fundId','transactionRecordId','sourceRecordType','fiscalYear','fiscalCalendar','datePrecision','dateBasis','annualAmountEligible','inferred','aggregate']
 return {...Object.fromEntries(keys.filter(key=>edge[key]!==undefined).map(key=>[key,edge[key]])),attribution:sourceAttribution(edge),evidenceDeferred:true}
}
