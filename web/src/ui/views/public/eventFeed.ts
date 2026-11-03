import { loadPublicEventFeed } from '../../../data/publicOrganization/events'

export const EVENT_PAGE_SIZE = 25

export function eventFeedPagePath(path:string, offset:number) {
 const [pathname,query] = path.split('?')
 const params = new URLSearchParams(query)
 params.set('limit',String(EVENT_PAGE_SIZE))
 params.set('offset',String(offset))
 return `${pathname}?${params}`
}

export function appendEventPage<T extends {id:string}>(previous:T[],page:T[]):T[] {
 const byId=new Map(previous.map(event=>[event.id,event]))
 for(const event of page)byId.set(event.id,event)
 return [...byId.values()]
}

export function isRecommendedFeed(path: string) {
 return path.split('?')[0] === '/api/network/events/recommended'
}

export async function loadEventFeed<T extends {id:string}>(path:string, token:string|null|undefined, requiresAuth:boolean, signal:AbortSignal):Promise<T[]> {
 const url=`/api/org${path}`
 if (!requiresAuth && !isRecommendedFeed(path)) return loadPublicEventFeed<T>(url,signal)
 // Account-dependent ordering must never enter the shared public feed cache.
 const response=await fetch(url,{signal,credentials:'omit',cache:'no-store',...(token?{headers:{Authorization:`Bearer ${token}`}}:{})})
 if (!response.ok) throw new Error((await response.text().catch(()=>'')) || `Failed to load events (${response.status})`)
 const rows:unknown=await response.json()
 if (!Array.isArray(rows) || rows.some(row=>!row || typeof row.id!=='string')) throw new Error('The event listing is unavailable.')
 return rows as T[]
}

type DatedEvent={starts_at?:string|null;ends_at?:string|null;event_date?:string|null}
export function groupEventFeed<T extends DatedEvent>(events:T[],recommended:boolean,now=Date.now()) {
 const starts=(event:T)=>Date.parse(event.starts_at || (event.event_date?`${event.event_date}T12:00:00` : ''))
 const isPast=(event:T)=>Date.parse(event.ends_at || event.starts_at || (event.event_date?`${event.event_date}T23:59:59` : '')) < now
 const upcoming=events.filter(event=>!isPast(event))
 if(!recommended)upcoming.sort((a,b)=>(starts(a)||Infinity)-(starts(b)||Infinity))
 return [
  {heading:'Upcoming events',events:upcoming},
  {heading:'Past events',events:events.filter(isPast).sort((a,b)=>starts(b)-starts(a))},
 ]
}
