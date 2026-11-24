/** Versioned, deterministic association policy. Scores are not probabilities. */
export const organizationMatcherVersion='organization-name-v1';
export type OrganizationMatch={version:string;score:number;automatic:boolean;left:string;right:string;reasons:string[];conflicts:string[];eins?:{organization:string[];source:string[]}};
const words=(name:string)=>name.normalize('NFKC').toLowerCase().replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
const expansions:Record<string,string>={univ:'university',dept:'department',incorporated:'inc',corporation:'corp',limited:'ltd'};
function normalized(name:string){
 let tokens=words(name).map(w=>expansions[w]||w);const changes:string[]=[];
 if(tokens[0]==='the'){tokens.shift();changes.push('Leading article removed');}
 if(tokens.slice(0,3).join(' ')==='board of trustees'||tokens.slice(0,3).join(' ')==='board of directors'){tokens=tokens.slice(3);if(tokens[0]==='of')tokens.shift();changes.push('Governing-board prefix removed');}
 if(tokens[0]==='the'){tokens.shift();changes.push('Leading article removed');}
 if(tokens.at(-1)==='the'){tokens.pop();changes.push('Trailing article removed');}
 return {tokens,text:tokens.join(' '),changes};
}
function distance(a:string,b:string){
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next;}
 return row[b.length];
}
export function matchOrganizationNames(left:string,right:string):OrganizationMatch{
 const a=normalized(left),b=normalized(right),reasons=[...new Set([...a.changes,...b.changes])],conflicts:string[]=[];
 const removed=a.tokens.filter(t=>!b.tokens.includes(t)),added=b.tokens.filter(t=>!a.tokens.includes(t));
 const protectedWords=new Set(['hospital','foundation','county','school','institute','laboratory','lab','center','centre','system','llc','inc','corp','ltd','trust','bank']);
 if([...removed,...added].some(t=>protectedWords.has(t)))conflicts.push('Institution, campus, organizational unit or legal suffix differs');
 const score=a.text&&b.text?Math.round(100*(1-distance(a.text,b.text)/Math.max(a.text.length,b.text.length))):0;
 const typo=a.tokens.length===b.tokens.length&&a.tokens.length>=3&&removed.length===1&&added.length===1&&Math.min(removed[0].length,added[0].length)>=4&&distance(removed[0],added[0])===1;
 if(a.text===b.text&&a.text)reasons.push('Full normalized names match');
 else if(typo)reasons.push('One single-character spelling difference');
 else reasons.push('Name similarity only');
 if(a.tokens.length!==b.tokens.length)conflicts.push('Additional or missing name words');
 const distinctive=a.tokens.filter(t=>!['university','of','and','department','state','college'].includes(t));
 if(!distinctive.length||a.text.length<8)conflicts.push('Name is too generic');
 return {version:organizationMatcherVersion,score,automatic:!conflicts.length&&(a.text===b.text||typo&&score>=95),left:a.text,right:b.text,reasons,conflicts};
}
/** Candidate blocking bounds edit-distance work; never establishes identity. */
export function organizationMatchCandidate(query:string,search:string){
 const q=normalized(query).tokens.filter(t=>t.length>=4&&!['university','department','college','state'].includes(t)),haystack=new Set(words(search));
 return q.length>0&&q.some(t=>haystack.has(t));
}
/** A filed legal identity takes precedence over a similar display name.
 * Related corporations and disregarded entities retain their separate EINs.
 * Only server-observed identifiers may be supplied here, never editor claims.
 */
export function matchOrganizationEins(match:OrganizationMatch,organization:string[],source:string[]):OrganizationMatch{
 const clean=(values:string[])=>[...new Set(values.map(v=>v.replace(/-/g,'')).filter(v=>/^\d{9}$/.test(v)&&v!=='000000000'))].sort();
 const left=clean(organization),right=clean(source);
 if(!left.length&&!right.length)return match;
 const result={...match,version:'organization-identity-v1',reasons:[...match.reasons],conflicts:[...match.conflicts],eins:{organization:left,source:right}};
 if(left.length>1||right.length>1){result.automatic=false;result.conflicts.push('Multiple EINs require a reviewed legal-entity boundary');}
 else if(right.length&&!left.length){result.automatic=false;result.conflicts.push('Confirm the organization EIN before associating an identified nonprofit');}
 else if(left.length&&right.length&&left[0]!==right[0]){result.automatic=false;result.conflicts.push('Different EINs identify separate legal entities; name similarity cannot merge them');}
 else if(left.length&&right.length){result.automatic=true;result.conflicts=[];result.reasons.push('Same recorded EIN as the reviewed organization grouping');}
 return result;
}
