// Cash labels use recorded USD transfers; never substitute total volume.
export function receivedUsdFromTotals(totals){
 if(!totals)return null
 const usd=totals.currencies?.find(total=>total.currency==='USD')
 return usd?Number.isFinite(usd.received)?usd.received:null:totals.missingAmounts?null:0
}
export function disbursedUsdFromTotals(totals){
 if(!totals)return null
 const usd=totals.currencies?.find(total=>total.currency==='USD')
 return usd?Number.isFinite(usd.disbursed)?usd.disbursed:null:totals.missingAmounts?null:0
}
// Keep cash directions explicit. A payer's spending must never be relabeled
// as receipts, and missing data must never be substituted with total volume.
export function cashFlowLabel(node){
 const received=node.receivedUsd,disbursed=node.disbursedUsd
 const incoming=received!==0||disbursed===0,outgoing=disbursed!==0||received===0
 return [incoming?`↓${shortReceivedAmount(received)}`:'',outgoing?`↑${shortReceivedAmount(disbursed)}`:''].filter(Boolean).join(' · ')
}
const compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1})
export const receivedAmountColor='#ffd166'
export function shortReceivedAmount(amount){
 return typeof amount==='number'&&Number.isFinite(amount)?compact.format(Object.is(amount,-0)?0:amount):'—'
}
