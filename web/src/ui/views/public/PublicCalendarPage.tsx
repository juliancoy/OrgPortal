import lifetechBrand from '../../../../../shared/lifetechBrand.json'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Search, Users } from 'lucide-react'
import { useAuth } from '../../../app/AppProviders'
import { eventCalendarDateKey } from '../../../features/events/medicalEvents'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { appendEventPage, EVENT_PAGE_SIZE, eventFeedPagePath, loadEventFeed } from './eventFeed'
import { pidpAppLoginUrl } from '../../../config/pidp'
import './lifeTechEvents.css'

const TIME_ZONE = 'America/New_York'
type CommunityEvent = {
 id:string;slug:string;title:string;description?:string|null;starts_at?:string|null;ends_at?:string|null;event_date?:string|null
 location?:string|null;image_url?:string|null;organization_name?:string|null;host_org_name?:string|null;community_event?:boolean;tags?:string[]
}
const topics=[['all','All events'],['community','LifeTech community'],['medical','Medicine & health'],['biotech','Biotech & research']] as const
function text(value?:string|null) { return (value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim() }
function dateKey(event:CommunityEvent) {return eventCalendarDateKey(event.starts_at||event.event_date||'')}
function eventDate(event:CommunityEvent) {return new Date(event.starts_at||(event.event_date?`${event.event_date}T12:00:00-05:00`:''))}
function dayParts(event:CommunityEvent) {
 const key=dateKey(event)
 return key?{month:new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',timeZone:TIME_ZONE}),day:key.slice(8)}:{month:'Date',day:'TBD'}
}
function eventTime(event:CommunityEvent) {
 if(!event.starts_at)return 'Time to be confirmed'
 return eventDate(event).toLocaleString('en-US',{timeZone:TIME_ZONE,weekday:'short',hour:'numeric',minute:'2-digit'})+' ET'+(dateKey(event).slice(0,4)!==eventCalendarDateKey(new Date().toISOString()).slice(0,4)?` · ${dateKey(event).slice(0,4)}`:'')
}
function localKey(date:Date) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function easternMidnight(key:string) {
 const part=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,timeZoneName:'shortOffset'}).formatToParts(new Date(`${key}T00:00:00Z`)).find(part=>part.type==='timeZoneName')?.value||'GMT-5'
 const hours=Number(part.replace('GMT',''))
 return `${key}T00:00:00${hours<0?'-':'+'}${String(Math.abs(hours)).padStart(2,'0')}:00`
}
function EventDate({event}:{event:CommunityEvent}) {const parts=dayParts(event);return <div className="lte-date" aria-label={dateKey(event)||'Date to be confirmed'}><span>{parts.month}</span><strong>{parts.day}</strong></div>}
function EventCard({event}:{event:CommunityEvent}) {
 return <article className="lte-card">
  <EventDate event={event}/>
  <div className="lte-card-copy">
   <p className="lte-card-source">{event.community_event?'LifeTech community':event.organization_name||event.host_org_name||'Around the region'}</p>
   <h3><Link to={`/events/${encodeURIComponent(event.slug)}`}>{event.title}</Link></h3>
   <div className="lte-meta"><span><Clock3 size={14} aria-hidden="true"/>{eventTime(event)}</span>{event.location&&<span><MapPin size={14} aria-hidden="true"/>{event.location}</span>}</div>
   {event.description&&<p className="lte-card-description">{text(event.description)}</p>}
  </div>
  <Link className="lte-card-link" to={`/events/${encodeURIComponent(event.slug)}`} aria-label={`View ${event.title}`}><ArrowRight size={20} aria-hidden="true"/></Link>
 </article>
}

export function PublicCalendarPage() {
 const {token}=useAuth()
 const [params,setParams]=useSearchParams()
 const view=params.get('view')==='calendar'?'calendar':'discover'
 const category=topics.some(([key])=>key===params.get('category'))?params.get('category')!:'all'
 const period=params.get('period')==='past'?'past':'upcoming'
 const query=params.get('q')||''
 const [search,setSearch]=useState(query)
 const month=/^[12]\d{3}-(0[1-9]|1[0-2])$/.test(params.get('month')||'')?params.get('month')!:eventCalendarDateKey(new Date().toISOString()).slice(0,7)
 const [events,setEvents]=useState<CommunityEvent[]>([])
 const [loading,setLoading]=useState(true)
 const [hasMore,setHasMore]=useState(false)
 const [error,setError]=useState('')
 const nextPage=useRef<(()=>Promise<void>)|null>(null)
 function update(key:string,value:string) {const next=new URLSearchParams(params);next.set(key,value);setParams(next,{replace:true})}
 useEffect(()=>setSearch(query),[query])
 useEffect(()=>{if(search.trim()===query)return;const timeout=setTimeout(()=>{const next=new URLSearchParams(params);if(search.trim())next.set('q',search.trim());else next.delete('q');setParams(next,{replace:true})},350);return()=>clearTimeout(timeout)},[search,query,params,setParams])
 const monthDate=new Date(`${month}-01T12:00:00`)
 const monthTitle=monthDate.toLocaleDateString('en-US',{month:'long',year:'numeric'})
 const monthEnd=localKey(new Date(monthDate.getFullYear(),monthDate.getMonth()+1,1))
 const request=new URLSearchParams({community:'lifetech',category,period:view==='calendar'?'all':period})
 if(query)request.set('q',query)
 if(view==='calendar'){request.set('from',easternMidnight(`${month}-01`));request.set('to',easternMidnight(monthEnd));request.set('sort','date')}
 const sourcePath=`/api/network/events/recommended?${request}`
 useEffect(()=>{
  const controller=new AbortController();let offset=0,busy=false,more=true
  setEvents([]);setHasMore(false);setError('');setLoading(true)
  async function loadPage() {
   if(busy||!more||controller.signal.aborted)return
   busy=true;setLoading(true);setError('')
   try {
    const page=await loadEventFeed<CommunityEvent>(eventFeedPagePath(sourcePath,offset),token,false,controller.signal)
    if(controller.signal.aborted)return
    setEvents(previous=>appendEventPage(previous,page));offset+=page.length;more=page.length===EVENT_PAGE_SIZE;setHasMore(more)
   }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Unable to load events. Please try again.')}
   finally{busy=false;if(!controller.signal.aborted)setLoading(false)}
  }
  nextPage.current=loadPage;void loadPage()
  return()=>{controller.abort();nextPage.current=null}
 },[sourcePath,token])
 useEffect(()=>{setSeoMeta({title:'Events • LifeTech',description:'Connect with the LifeTech community at medical, health and biotech events in Baltimore and beyond.',canonicalUrl:`${window.location.origin}/events`,type:'website'})},[])
 useEffect(()=>{upsertJsonLd('medtech-general-calendar',{'@context':'https://schema.org','@type':'ItemList',name:'LifeTech events',itemListElement:events.map((event,index)=>({'@type':'ListItem',position:index+1,name:event.title,url:`${window.location.origin}/events/${encodeURIComponent(event.slug)}`}))})},[events])
 const featured=view==='discover'&&period==='upcoming'&&category==='all'&&!query?events.find(event=>event.community_event):undefined
 const listed=events.filter(event=>event.id!==featured?.id)
 const monthDays=useMemo(()=>{
  const start=new Date(`${month}-01T12:00:00`);start.setDate(1-start.getDay())
  return Array.from({length:42},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);const key=localKey(date);return {key,day:date.getDate(),inMonth:key.startsWith(month),events:events.filter(event=>dateKey(event)===key)}})
 },[month,events])
 function moveMonth(delta:number){update('month',localKey(new Date(monthDate.getFullYear(),monthDate.getMonth()+delta,1)).slice(0,7))}
 return <section className="lte-page">
  <header className="lte-heading">
   <div><p className="lte-eyebrow"><span/> LifeTech / Events</p><h1>{lifetechBrand.tagline}</h1><p className="lte-intro">Meet the people moving health forward. Discover community gatherings, new ideas, and the work happening around you.</p></div>
   <div className="lte-heading-note"><CalendarDays size={23} aria-hidden="true"/><p>Baltimore & beyond<span>Health · Medicine · Biotech</span></p></div>
  </header>
  {featured&&<article className="lte-featured">
   <div className="lte-featured-copy"><p className="lte-eyebrow">Coming up with LifeTech</p><h2><Link to={`/events/${encodeURIComponent(featured.slug)}`}>{featured.title}</Link></h2>{featured.description&&<p className="lte-featured-description">{text(featured.description)}</p>}<div className="lte-meta"><span><Clock3 size={16} aria-hidden="true"/>{eventTime(featured)}</span>{featured.location&&<span><MapPin size={16} aria-hidden="true"/>{featured.location}</span>}</div><div className="lte-featured-actions"><Link className="lte-primary-link" to={`/events/${encodeURIComponent(featured.slug)}`}>Explore event <ArrowRight size={17} aria-hidden="true"/></Link>{/demo day/i.test(featured.title)&&<Link to={`/events/${encodeURIComponent(featured.slug)}#submissions`} aria-label="Submissions and voting">Submissions <ArrowRight size={16} aria-hidden="true"/></Link>}</div></div>
   <div className="lte-featured-date"><span>Save the date</span><EventDate event={featured}/><small>{dateKey(featured)?`${eventDate(featured).toLocaleDateString('en-US',{timeZone:TIME_ZONE,weekday:'long'})} · ${dateKey(featured).slice(0,4)}`:'Date to be confirmed'}</small></div>
  </article>}
  <div className="lte-controls">
   <div className="lte-view-switch" role="group" aria-label="Event view"><button type="button" aria-pressed={view==='discover'} onClick={()=>update('view','discover')}>Discover</button><button type="button" aria-pressed={view==='calendar'} onClick={()=>update('view','calendar')}><CalendarDays size={16} aria-hidden="true"/> Calendar</button></div>
   <label className="lte-search"><Search size={18} aria-hidden="true"/><span className="sr-only">Search events</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find an event, topic, or host"/></label>
  </div>
  <div className="lte-topics" role="group" aria-label="Event topics">{topics.map(([key,label])=><button type="button" key={key} aria-pressed={category===key} onClick={()=>update('category',key)}>{label}</button>)}</div>

  <div className="lte-content">
   <div className="lte-results" aria-busy={loading}>
    <div className="lte-results-heading"><div><p className="lte-eyebrow">{view==='calendar'?'Plan ahead':period==='past'?'From the community':'Find your next event'}</p><h2>{view==='calendar'?monthTitle:query?`Results for “${query}”`:category==='community'?'LifeTech gatherings':period==='past'?'Past events':'Worth getting together for'}</h2></div>{view==='discover'?<label className="lte-period"><span className="sr-only">Event dates</span><select value={period} onChange={event=>update('period',event.target.value)}><option value="upcoming">Upcoming</option><option value="past">Past events</option></select></label>:<div className="lte-month-controls"><button type="button" aria-label="Previous month" onClick={()=>moveMonth(-1)}><ChevronLeft size={18}/></button><button type="button" onClick={()=>update('month',eventCalendarDateKey(new Date().toISOString()).slice(0,7))}>Today</button><button type="button" aria-label="Next month" onClick={()=>moveMonth(1)}><ChevronRight size={18}/></button></div>}</div>
    {loading&&!events.length&&<div className="lte-loading" role="status"><span/>Finding your next connection…</div>}
    {!loading&&!error&&!events.length&&<div className="lte-empty"><CalendarDays size={32} aria-hidden="true"/><h3>No events here just yet</h3><p>{query||category!=='all'?'Try another topic or clear your search.':view==='calendar'?'Try another month or switch to Discover.':'Check back for the next gathering.'}</p>{(query||category!=='all')&&<button type="button" onClick={()=>{const next=new URLSearchParams(params);next.delete('q');next.delete('category');setSearch('');setParams(next,{replace:true})}}>Clear filters</button>}</div>}
    {view==='discover'?<div className="lte-event-list">{listed.map(event=><EventCard key={event.id} event={event}/>)}</div>:<div className="lte-calendar" aria-label={monthTitle}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div className="lte-weekday" key={day}>{day}</div>)}{monthDays.map(day=><div className={`lte-day${day.inMonth?'':' lte-day-outside'}${day.key===eventCalendarDateKey(new Date().toISOString())?' lte-day-today':''}`} key={day.key}><time dateTime={day.key}>{day.day}</time>{day.events.map(event=><Link key={event.id} to={`/events/${encodeURIComponent(event.slug)}`} className={event.community_event?'lte-calendar-community':''}>{event.title}</Link>)}</div>)}</div>}
    {error&&<div className="lte-error" role="alert"><p>We couldn’t load {events.length?'more':'the'} events. Please try again.</p><button type="button" disabled={loading} onClick={()=>void nextPage.current?.()}>Retry</button></div>}
    {hasMore&&!error&&<button className="lte-load-more" type="button" disabled={loading} onClick={()=>void nextPage.current?.()}>{loading?'Loading…':view==='calendar'?'Load more events in this month':'More events'}<ArrowDown size={16} aria-hidden="true"/></button>}
    {view==='calendar'&&hasMore&&<p className="lte-page-note">Showing {events.length} events. Load more to see the rest of this month.</p>}
   </div>
   <aside className="lte-sidebar"><div className="lte-community-panel"><span className="lte-icon"><Users size={22} aria-hidden="true"/></span><h2>Better together.</h2><p>A room full of people who care about what you care about.</p><Link to="/people">Meet the community <ArrowRight size={16} aria-hidden="true"/></Link><Link to="/orgs">Explore organizations <ArrowRight size={16} aria-hidden="true"/></Link></div><div className="lte-personal-note"><span className="lte-eyebrow">Made for your interests</span><p>{token?'Your groups, registrations, and recent participation help bring the right events to the top.':'LifeTech gatherings first, with medical and biotech events from across the region.'}</p>{!token&&<a href={pidpAppLoginUrl('/events')}>Sign in for your event picks <ArrowRight size={15} aria-hidden="true"/></a>}</div></aside>
  </div>
 </section>
}
