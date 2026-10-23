/** All upcoming events hosted by this organization, shared by home/profile views. */
export async function loadHostedOrganizationEvents<T extends {id:string}>(slug:string,signal?:AbortSignal):Promise<T[]> {
 const events=new Map<string,T>(),limit=200
 for(let offset=0;;offset+=limit){
  const response=await fetch(`/api/org/api/network/orgs/public/${encodeURIComponent(slug)}/events?upcoming_only=true&hosted_only=true&limit=${limit}&offset=${offset}`,{signal})
  if(!response.ok)throw new Error('Unable to load organization events.')
  const page=await response.json() as T[]
  if(!Array.isArray(page)||page.some(event=>!event||typeof event.id!=='string'))throw new Error('Invalid organization event response.')
  const before=events.size
  for(const event of page)events.set(event.id,event)
  if(page.length<limit)return [...events.values()]
  if(offset>0&&before===events.size)throw new Error('Organization event pagination did not advance.')
 }
}
