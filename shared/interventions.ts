export type Initiative = {
 id:string; organizationId:string; revision:number; title:string; outcome:string; metric:string; unit:string;
 baseline:number|null; target:number|null; current:number|null; baselineDate:string; targetDate:string; measurementDate:string;
 authorityReferenceId:string; authority:string; authoritySourceUrl:string; instrument:string; decisionDate:string;
 nextAction:string; actionDueDate:string; constraints:string; facts:string; factSourceUrl:string;
 hypothesis:string; evidenceStatus:'unreviewed'|'reviewed'; status:'proposed'|'authorized'|'active'|'paused'|'completed';
 authorizationUrl:string; result:string; resultSourceUrl:string; updatedAt?:string; organizationName?:string;
}
export const initiativeStatuses=['proposed','authorized','active','paused','completed'] as const
export function newInitiative(organizationId=''):Initiative{
 return {id:crypto.randomUUID(),organizationId,revision:0,title:'',outcome:'',metric:'',unit:'',baseline:null,target:null,current:null,baselineDate:'',targetDate:'',measurementDate:'',authorityReferenceId:'',authority:'',authoritySourceUrl:'',instrument:'administrative',decisionDate:'',nextAction:'',actionDueDate:'',constraints:'',facts:'',factSourceUrl:'',hypothesis:'',evidenceStatus:'unreviewed',status:'proposed',authorizationUrl:'',result:'',resultSourceUrl:''}
}
export function nextDeadline(i:Initiative){return [i.decisionDate,i.actionDueDate,i.targetDate].filter(Boolean).sort()[0]||''}
export function initiativeProgress(i:Initiative){
 if(i.baseline===null||i.target===null||i.current===null||i.target===i.baseline)return null
 return Math.max(0,Math.min(100,(i.current-i.baseline)/(i.target-i.baseline)*100))
}
export function initiativeSummary(items:Initiative[],today:string){return {total:items.length,active:items.filter(i=>i.status==='active').length,proposed:items.filter(i=>i.status==='proposed').length,completed:items.filter(i=>i.status==='completed').length,overdue:items.filter(i=>!['completed','paused'].includes(i.status)&&nextDeadline(i)!==''&&nextDeadline(i)<today).length}}
