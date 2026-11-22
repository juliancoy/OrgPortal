// Explicit BPW agency codes from the published Comptroller source, cross-referenced
// to the reviewed DBM agency listing. Sub-agencies are not merged into departments.
const bpwBudgetCodes = {
 AIB:'R12',ARCHIVE:'D60',ATCC:'E17',BPW:'D05',COMM:'T00',COMP:'E00',CPPDA:'D90',
 DBM:'F10',DGS:'H00',DHCD:'S00',DHS:'N00',DJS:'V00',DNR:'K00',DPSCS:'Q00',DSCI:'I00',DVMF:'D55',DoIT:'F50',
 HSMC:'D17',IAC:'D25',MCA:'D23',MDA:'L00',MDE:'U00',MDEM:'D52',MDH:'M00',MDJ:'C00',MDOA:'D26',MDOD:'D12',
 MDOL:'P00',MDOT:'J00',MDP:'D40',MDSP:'W00',MEA:'D13',MHEC:'R62',MIA:'D80',MIEMSS:'D53',MLGCA:'E75',
 MMD:'D50',MPSC:'C90',MSA:'D28',MSD:'R99',MSDE:'R00',MSLA:'R11',OAG:'C81',OAH:'D99',OCO:'D74',
 OPC:'C91',OPD:'C80',OSP:'C82',SBE:'D38',SDAT:'E50',SOS:'D16',STO:'E20',WCC:'C98',
}
export function marylandAgencyReferences(organizations) {
 const references = []
 for (const org of organizations) {
  if (org.governmentParentId !== 'research-state-maryland' || !org.budgetAgencyCode || org.entityType === 'budget_heading') continue
  const common = {system:'maryland_comptroller',organizationId:org.id,sourceUrl:org.governmentSourceUrl || 'https://www.maryland.gov/your-government/state-agencies-and-departments'}
  references.push({...common,dataset:'mdview',code:org.budgetAgencyCode})
  for (const [code,budgetCode] of Object.entries(bpwBudgetCodes)) if (budgetCode === org.budgetAgencyCode) references.push({...common,dataset:'bpw',code})
 }
 return references
}
