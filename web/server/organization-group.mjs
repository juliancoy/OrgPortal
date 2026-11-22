// A read-only projection over exact public IDs. Grouping never rewrites evidence.
export async function organizationGroup(read,readRows,manifest,params){
 const handle=params.get('org');if(!handle||handle.length>300)throw Error('Invalid organization reference')
 let members=[]
 if(params.has('members')){try{members=JSON.parse(params.get('members'))}catch{throw Error('Invalid grouping members')}
  if(!Array.isArray(members)||members.length>50||members.some(id=>typeof id!=='string'||!id||id.length>300))throw Error('Invalid grouping members')}
 const version=manifest.version,aliases=await read(`${version}/organization-evidence/index.json`)
 if(!Object.hasOwn(aliases,handle))return null
 const handles=[handle,...new Set(members)],missing=handles.filter(id=>!Object.hasOwn(aliases,id))
 const positions=[...new Set(handles.filter(id=>Object.hasOwn(aliases,id)).map(id=>aliases[id]))]
 if(positions.some(id=>!Number.isSafeInteger(id)||id<0))throw Error('Invalid ambiguous organization reference')
 const profiles=manifest.organizationEvidenceIndexVersion===1?await readRows(read,version,'organization-evidence',positions):await Promise.all(positions.map(id=>read(`${version}/organization-evidence/${id}.json`)))
 const root=profiles[0]
 if(profiles.length===1)return {...root,members:[root.organization],missingMembers:missing}
 const ids=new Set(profiles.map(p=>p.organization.id)),recordIndices=[...new Set(profiles.flatMap(p=>p.recordIndices))].sort((a,b)=>a-b),recordKinds=Object.create(null)
 for(const profile of profiles)for(const [kind,indices] of Object.entries(profile.recordKinds))recordKinds[kind]=[...new Set([...(recordKinds[kind]||[]),...indices])].sort((a,b)=>a-b)
 const relatives=key=>[...new Map(profiles.flatMap(p=>p[key]).filter(p=>!ids.has(p.id)).map(p=>[p.id,p])).values()]
 let recordFiscalYears
 if(profiles.every(p=>p.recordFiscalYears)){
  recordFiscalYears=Object.create(null)
  for(const profile of profiles)for(const [year,indices] of Object.entries(profile.recordFiscalYears))recordFiscalYears[year]=[...new Set([...(recordFiscalYears[year]||[]),...indices])].sort((a,b)=>a-b)
 }
 const financialMembers=[...new Set(profiles.flatMap(p=>p.financialMembers||[p.organization.id]))].sort()
 return {...root,recordFiscalYears,financialMembers,financialTotalsByYear:undefined,financialTotals:undefined,organization:{...root.organization,recordCount:recordIndices.length},parents:relatives('parents'),children:relatives('children'),
  groups:Object.entries(recordKinds).map(([kind,indices])=>({kind,count:indices.length})),recordIndices,recordKinds,
  members:profiles.map(p=>p.organization),missingMembers:missing}
}
