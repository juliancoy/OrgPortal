import {financialEvidence} from './financial-evidence.js'
const facts=new Set(['revenue','expense','obligation','appropriation','reported_award'])
// Separate periods and measurement bases. Cumulative snapshots cannot be added
// to transaction deltas, nor can annual statements be added to cash payments.
export function summarizeNodeObservations(records,id){
 const groups=new Map(),seen=new Set()
 for(const row of records){
  const fact=financialEvidence(row)||row.kind
  if(!facts.has(fact)||row.status==='voided'||row.source===row.target)continue
  const incoming=row.target===id,outgoing=row.source===id
  if(!incoming&&!outgoing)continue
  const identity=row.transactionRecordId||row.id
  if(identity&&seen.has(identity))continue
  if(identity)seen.add(identity)
  if((row.currency||(/^\$/.test(row.amountLabel||'')?'USD':null))!=='USD')continue
  const nonAdditive=row.annualAmountEligible===false||/cumulative|lifetime/i.test(`${row.measurement||''} ${row.financialMeasure||''}`)
  const annual=fact==='revenue'||fact==='expense'
  const periodStart=annual?row.periodStart||'':'',periodEnd=annual?row.periodEnd||'':'',fiscalYear=row.fiscalYear||null
  const key=JSON.stringify([fact,fiscalYear,periodStart,periodEnd,nonAdditive])
  const value=groups.get(key)||{fact,fiscalYear,periodStart,periodEnd,nonAdditive,received:null,disbursed:null,recordCount:0,missingAmounts:0}
  value.recordCount++
  if(!Number.isFinite(row.amount))value.missingAmounts++
  else if(!nonAdditive){const direction=incoming?'received':'disbursed';value[direction]=(value[direction]??0)+row.amount}
  groups.set(key,value)
 }
 return [...groups.values()].sort((a,b)=>(b.fiscalYear||0)-(a.fiscalYear||0)||b.periodEnd.localeCompare(a.periodEnd)||a.fact.localeCompare(b.fact))
}
const names={revenue:'Annual revenue',expense:'Annual expense',obligation:'Obligations',appropriation:'Appropriations',reported_award:'Reported awards'}
const shortNames={revenue:'Rev',expense:'Exp',obligation:'Oblig',appropriation:'Budget',reported_award:'Award'}
const compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1})
const valid=value=>typeof value==='number'&&Number.isFinite(value)
const directions=(received,disbursed,format)=>[valid(received)?`↓${format(received)}`:'',valid(disbursed)?`↑${format(disbursed)}`:''].filter(Boolean).join(' · ')
export function observationTitle(row){return `${names[row.fact]||row.fact}${row.nonAdditive?' snapshots':''}${row.periodStart&&row.periodEnd?` · ${row.periodStart} – ${row.periodEnd}`:row.fiscalYear?` · FY${row.fiscalYear}`:' · year unavailable'}`}
export function observationAmount(row,format=value=>compact.format(value)){
 return row.nonAdditive?'See individual records':directions(row.received,row.disbursed,format)||'Amount unavailable'
}
export function nodeAmountLabel(node){
 if(node.relationshipCash){
  const cash=node.relationshipCash,label=directions(cash.receivedUsd,cash.disbursedUsd,value=>compact.format(value))
  return label?`Cash ${label}${cash.missingAmounts?'*':''}`:cash.missingAmounts?'Amount unavailable':'No direct cash'
 }
 const labels=[]
 if(valid(node.receivedUsd)||valid(node.disbursedUsd)){
  const bothZero=node.receivedUsd===0&&node.disbursedUsd===0
  labels.push('Cash '+directions(node.receivedUsd!==0||bothZero?node.receivedUsd:null,node.disbursedUsd!==0||bothZero?node.disbursedUsd:null,value=>compact.format(value)))
 }
 // Show the newest period for each evidence type on the small node label.
 // Every period remains available in the inspector, never silently summed.
 const latest=new Map()
 for(const row of node.financialObservations||[]){const key=row.fact+':'+row.nonAdditive;if(!latest.has(key))latest.set(key,row)}
 for(const row of [...latest.values()].sort((a,b)=>Number(a.nonAdditive)-Number(b.nonAdditive)||['revenue','expense','obligation','reported_award','appropriation'].indexOf(a.fact)-['revenue','expense','obligation','reported_award','appropriation'].indexOf(b.fact)))labels.push(`${shortNames[row.fact]||row.fact}${row.nonAdditive?' snapshots':` ${observationAmount(row)}`}${row.fiscalYear?` FY${row.fiscalYear}`:''}`)
 return labels[0]||'Amount unavailable'
}
