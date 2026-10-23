/** Membership-scoped display titles. These never participate in authorization. */
export function readMemberTitles(value:unknown):string[] {
 try{const parsed=typeof value==='string'?JSON.parse(value):value;return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[]}catch{return []}
}
export type MemberPortrait={url:string;source_url:string}
export function readMemberPortrait(value:unknown):MemberPortrait|null {
 try { const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed.url==='string'&&typeof parsed.source_url==='string'?{url:parsed.url,source_url:parsed.source_url}:null }catch{return null}
}
