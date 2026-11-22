import {useLocation,useSearchParams} from 'react-router-dom'
export const defaultOrganizationYear='2025'
export function organizationYear(value:string|null):string {
 return value==='all'||value==='unassigned'||/^(19|20|21)\d{2}$/.test(value||'')?value!:defaultOrganizationYear
}
export function useOrganizationYear(){
 const [params,setParams]=useSearchParams(),location=useLocation(),fy=organizationYear(params.get('fy'))
 return {fy,setYear:(year:string)=>{const next=new URLSearchParams(params);next.set('fy',organizationYear(year));setParams(next,{state:location.state})}}
}
