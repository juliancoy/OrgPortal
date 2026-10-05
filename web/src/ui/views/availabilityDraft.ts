const key=(user:string,start:string,timezone:string)=>`orgportal.availabilityDraft:${user}:${start}:${timezone}`
export function readAvailabilityDraft(user:string,start:string,timezone:string,allowed:string[]):string[]|null {
 try {const raw=localStorage.getItem(key(user,start,timezone));if(raw===null)return null;const value:unknown=JSON.parse(raw);return Array.isArray(value)&&value.every(slot=>typeof slot==='string'&&allowed.includes(slot))?[...new Set(value)]:null}catch{return null}
}
export function writeAvailabilityDraft(user:string,start:string,timezone:string,slots:string[]) {
 try{localStorage.setItem(key(user,start,timezone),JSON.stringify(slots))}catch{/* Account saving remains available when browser storage is disabled. */}
}
export function clearAvailabilityDraft(user:string,start:string,timezone:string){try{localStorage.removeItem(key(user,start,timezone))}catch{}}
