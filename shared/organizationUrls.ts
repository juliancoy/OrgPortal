export const organizationPagePath=(slug:string)=>`/orgs/${encodeURIComponent(slug)}`;
export function isRetiredOrganizationHref(value:string):boolean {
 try{return /^\/(?:p\/)?portals(?:\/|$)/.test(new URL(value,'https://portal.invalid').pathname)}catch{return false}
}

/** Rewrite stored legacy homepage URLs without changing unrelated destinations. */
export function canonicalOrganizationHref(value:string|null|undefined,organizationSlug:string|null|undefined):string|null {
 if(!value)return null;
 try {
  const base='https://portal.invalid',url=new URL(value,base);
  const legacy=/^(\/p)?\/portals\/[^/]+(?:\/(branding))?\/?$/.exec(url.pathname);
  if(!legacy)return isRetiredOrganizationHref(value)?null:value;
  if(!organizationSlug)return null;
  url.pathname=(legacy[1]||'')+organizationPagePath(organizationSlug);
  if(legacy[2])url.searchParams.set('tab','branding');
  return url.origin===base?`${url.pathname}${url.search}${url.hash}`:url.href;
 }catch{return value}
}

/** A configured org homepage is a destination, never an app routing prefix. */
export function organizationRoutingBase(value:string):string {
 try {
  const url=new URL(value);
  url.pathname=url.pathname.replace(/\/(?:orgs|portals)\/[^/]+(?:\/branding)?\/?$/, '').replace(/\/+$/, '') || '/';
  url.search='';url.hash='';
  return url.href.replace(/\/+$/, '');
 }catch{return value.replace(/\/+$/, '')}
}
