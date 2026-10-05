import { useState } from 'react'
export function CompanyIcon({name,src}:{name:string;src?:string}) {
 const [failed,setFailed]=useState(false)
 return <span className="tedco-company-icon" aria-hidden="true">{src&&!failed?<img src={src} alt="" loading="lazy" onError={()=>setFailed(true)}/>:name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span>
}
