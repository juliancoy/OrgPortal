export type PerformanceAward={awardKey:string;awardId:string;recipientId:string;recipientName:string;identified:boolean;agency:string;amount:number;financialMeasure:string;sourceName:string;sourceUrl:string;description:string;program:string;networkOrganizationId?:string}
export type PerformanceAssessment={awardKey:string;cohort:string;metric:string;unit:string;commitment:string;result:string;reviewerOrganization:string;methodology:string;commitmentUrl:string;resultUrl:string;reviewUrl:string;dueDate:string;measuredDate:string;reviewedDate:string;direction:'higher'|'lower';target:number;actual:number;attainment:number|null;meetsTarget:boolean;evidenceBasis:'certified'|'company-reported'|'agency-measured'}
export type PerformanceData={schemaVersion:number;generatedAt:string;coverage:{start:string;end:string;retrievedAt:string;recipientState:string};records:PerformanceAward[];assessments:PerformanceAssessment[]}
export function performanceRows(data:PerformanceData,today:string){
 const assessments=new Map(data.assessments.filter(a=>a.reviewedDate<=today).map(a=>[a.awardKey,a]))
 return data.records.map(award=>({...award,assessment:award.identified?assessments.get(award.awardKey):undefined}))
}
export function recipientExposure(records:PerformanceAward[]){
 const totals=new Map<string,{id:string;name:string;amount:number;awards:number}>()
 for(const a of records){if(!a.identified)continue;const key=JSON.stringify([a.recipientId,a.financialMeasure]);const r=totals.get(key)||{id:a.recipientId,name:a.recipientName,amount:0,awards:0};r.amount+=a.amount;r.awards++;totals.set(key,r)}
 return [...totals.values()].sort((a,b)=>b.amount-a.amount||a.id.localeCompare(b.id))
}
export function compareAttainment(a:PerformanceAssessment,b:PerformanceAssessment){
 // A zero lower-is-better actual meets the target and ranks above finite ratios.
 if(a.attainment===null)return b.attainment===null?0:1
 if(b.attainment===null)return -1
 return a.attainment-b.attainment
}
