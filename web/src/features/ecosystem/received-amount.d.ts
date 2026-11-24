export function receivedUsdFromTotals(totals?:{currencies:{currency:string;received:number}[];missingAmounts:number}):number|null
export function disbursedUsdFromTotals(totals?:{currencies:{currency:string;disbursed:number}[];missingAmounts:number}):number|null
export function cashFlowLabel(node:{receivedUsd?:number|null;disbursedUsd?:number|null}):string
export const receivedAmountColor:string
export function shortReceivedAmount(amount:number|null|undefined):string
