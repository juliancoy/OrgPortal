export type FinancialObservation={fact:string;fiscalYear:number|null;periodStart:string;periodEnd:string;nonAdditive:boolean;received:number|null;disbursed:number|null;recordCount:number;missingAmounts:number}
export function summarizeNodeObservations(records:Record<string,unknown>[],id:string):FinancialObservation[]
export function observationTitle(row:FinancialObservation):string
export function observationAmount(row:FinancialObservation,format?:(value:number)=>string):string
export function nodeAmountLabel(node:{receivedUsd?:number|null;disbursedUsd?:number|null;financialObservations?:FinancialObservation[];relationshipCash?:{receivedUsd:number|null;disbursedUsd:number|null;missingAmounts:number}}):string
