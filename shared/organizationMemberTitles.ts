/** Membership-scoped display titles. These never participate in authorization. */
export function readMemberTitles(value:unknown):string[] {
 try{const parsed=typeof value==='string'?JSON.parse(value):value;return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[]}catch{return []}
}
