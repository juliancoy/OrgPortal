import { useEffect, useRef } from 'react'

/** One anonymous count per organization-page entry; tab changes are not new views. */
export function useOrganizationPageView(slug:string|null,dashboard:boolean) {
 const counted=useRef<string|null>(null)
 useEffect(()=>{
  if(!slug||dashboard){counted.current=null;return}
  if(counted.current===slug)return
  counted.current=slug
  void fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(slug)}/page-view`,{
   method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'omit',keepalive:true,
  }).catch(()=>{/* A failed counter must never block the organization page. */})
 },[slug,dashboard])
}
