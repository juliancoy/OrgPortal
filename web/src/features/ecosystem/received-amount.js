// Only recorded USD receipts belong on the label; never substitute total volume.
export function receivedUsdFromTotals(totals){
 if(!totals)return null
 const usd=totals.currencies?.find(total=>total.currency==='USD')
 return usd?Number.isFinite(usd.received)?usd.received:null:totals.missingAmounts?null:0
}
const compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1})
export const receivedAmountColor='#ffd166'
export function shortReceivedAmount(amount){
 return typeof amount==='number'&&Number.isFinite(amount)?compact.format(Object.is(amount,-0)?0:amount):'—'
}
