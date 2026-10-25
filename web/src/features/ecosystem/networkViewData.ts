export type NetworkOrganization = { id: string; name: string }
export type NetworkEvent = { id: string; title: string; date: string; sourceUrl: string; organizationId: string | null; organizationName: string; location: string }
export type NetworkRelationship = { id: string; source: string | null; target: string | null; sourceLabel: string; targetLabel: string; type: string; kind: string; relationship: string; date: string }
export type NonprofitProfile = { ein:string; organizationId:string; name:string; formType:string; periodStart:string; periodEnd:string; taxYear:number; filedAt:string; amended:boolean; accountingBasis:string; sourceUrl:string; archiveUrl:string; retrievedAt:string; revenue:number|null; expenses:number|null; assets:number|null; liabilities:number|null; propublicaUrl:string; apiLatestTaxPeriod?:string|null }
export type NetworkData = {
  nonprofitCoverage?: {indexYear:number;scope:string;profileCount:number;grantRecordCount:number;retrievedAt:string}; nonprofitProfiles?:NonprofitProfile[];
  organizations: NetworkOrganization[]; relationships: NetworkRelationship[]; financing: unknown[];
  governmentCoverage?: { start: string; end: string; retrievedAt?: string; recipientState: string };
  events?: NetworkEvent[]; lastCheckedAt?: number; offline?: boolean;
}

