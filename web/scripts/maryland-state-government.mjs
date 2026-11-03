import {projectMarylandBudget,datasetUrl,statusSourceUrl} from './maryland-budget.mjs'
export const marylandId='research-state-maryland'
export const governmentSource='https://www.maryland.gov/your-government/state-agencies-and-departments'
export function projectMarylandGovernment(rows,existing,agencies,{fiscalYear=2027,budgetStatus='legislative_appropriation'}={}){
 const codes=new Map(agencies.map(a=>[a.code,a])),groups=new Map(),prior=new Map(existing.map(o=>[o.id,o]))
 if(codes.size!==agencies.length||new Set(agencies.map(a=>a.id)).size!==agencies.length)throw Error('Ambiguous agency crosswalk')
 for(const row of rows){if(!codes.has(row.agency_code))throw Error('Unreviewed budget agency');if(!groups.has(row.agency_code))groups.set(row.agency_code,[]);groups.get(row.agency_code).push(row)}
 if(groups.size!==codes.size)throw Error('Incomplete state agency listing')
 const state={...prior.get(marylandId),id:marylandId,name:'State of Maryland',type:'State government organization',entityType:'organization',category:'state-government',website:'https://www.maryland.gov/',directory:prior.get(marylandId)?.directory||false,governmentMembers:[],governmentSourceUrl:governmentSource}
 const organizations=[state],relationships=[]
 for(const agency of agencies){
  const before=prior.get(agency.id),heading=agency.classification==='budget_heading'
  organizations.push({...before,id:agency.id,name:before?.name||agency.name,type:heading?'State budget heading':agency.classification==='department'?'State government department':'State government agency / office',entityType:heading?'budget_heading':'organization',category:'state-government',directory:before?.directory||false,governmentParentId:state.id,budgetAgencyCode:agency.code,budgetAgencyName:agency.name,governmentClassification:agency.classification,principalDepartment:agency.principalDepartment,governmentSourceUrl:governmentSource,sourceCategory:before?.sourceCategory||'Maryland DBM'})
  state.governmentMembers.push({id:agency.id,name:agency.name,code:agency.code,classification:agency.classification,principalDepartment:agency.principalDepartment})
  const sourceUrl=new URL('https://opendata.maryland.gov/resource/gy87-e27x.json');sourceUrl.searchParams.set('$where',`fiscal_year=${fiscalYear} AND agency_code='${agency.code}'`)
  relationships.push({id:'md-government-agency:'+agency.code,source:state.id,target:agency.id,sourceLabel:state.name,targetLabel:agency.name,kind:'agency',relationship:'affiliation',amount:null,currency:null,status:'reported',type:heading?'Budget heading in the Maryland state budget':agency.classification==='department'?'Department of the State of Maryland':'Agency / office listed in the Maryland state budget',sourceUrl:heading?sourceUrl.href:governmentSource,evidence:`DBM agency code ${agency.code}; FY${fiscalYear} budget agency listing.`,notes:'Organizational/budget-listing relationship only, not a payment or additional appropriation. Branches and independent agencies are not asserted to report to a department or the Governor.',provenance:{sheet:'Maryland state government and DBM budget agency listing',datasetUrl,governmentSource,agencyCode:agency.code,classification:agency.classification}})
  const budget=projectMarylandBudget(groups.get(agency.code),{fiscalYear,agencyCode:agency.code,targetId:agency.id,targetName:agency.name,budgetStatus,statusEvidenceUrl:statusSourceUrl,sourceOrganization:state})
  relationships.push(...budget.relationships)
 }
 state.governmentMembers.sort((a,b)=>a.name.localeCompare(b.name)||a.code.localeCompare(b.code))
 return {organizations,relationships}
}
