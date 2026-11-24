/** Explicit display associations approved for the initial grouping release.
 * These are not account links or assertions of legal identity. Stored edits win,
 * including an empty group; source records and their original endpoints survive.
 */
export const evidenceGroupSource = 'orgportal:evidence-group';
// Explicit removals survive subsequent matcher versions and source refreshes.
export const evidenceGroupExclusionSource = 'orgportal:evidence-group-excluded';
export const defaultEvidenceGroups: Record<string, string[]> = {
 'compass-agency:a44ff7414e0ba84c9068': [
  'source-label:maryland_comptroller:recipient:98db49db361400f16726d978ba1205b7',
  'source-label:maryland_comptroller:recipient:638e1be206b0450dc15042230452fb90',
  'source-label:maryland_comptroller:recipient:bd1ec2346e48d8a687b2620c92b197b1',
  'source-label:maryland_comptroller:recipient:97059ee4c92dd2961d1234660b9da32d',
  'source-label:maryland_comptroller:recipient:e2669eb4a053222300d0ec20606aee36',
  'usgov:recipient:Y33WNNTMNGJ5',
  'source-label:maryland_comptroller:recipient:000c8e8b7be2bbdfd09e9f19c2e96a70',
 ],
};
export type EvidenceGrouping = {organizationId:string;slug:string;name:string;members:string[]};
