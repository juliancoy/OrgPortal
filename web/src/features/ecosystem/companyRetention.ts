import source from '../../../data/company-location-benchmark.json'
export type CompanyLocationCounts={totalCompanies:number;inMaryland:number;outsideMaryland:number;operatingInformationUnavailable:number}
export function companyLocationStats(counts:CompanyLocationCounts){
 const {totalCompanies,inMaryland,outsideMaryland,operatingInformationUnavailable}=counts
 if(![totalCompanies,inMaryland,outsideMaryland,operatingInformationUnavailable].every(n=>Number.isSafeInteger(n)&&n>=0)||inMaryland+outsideMaryland+operatingInformationUnavailable!==totalCompanies)throw Error('Company location counts must reconcile to the complete source cohort')
 return {outsidePercent:totalCompanies?outsideMaryland/totalCompanies*100:null,unknownPercent:totalCompanies?operatingInformationUnavailable/totalCompanies*100:null}
}
export const companyLocationBenchmark=source
