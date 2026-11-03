import {afterEach,expect,it,vi} from 'vitest'
import {appendEventPage,EVENT_PAGE_SIZE,eventFeedPagePath,groupEventFeed,loadEventFeed} from './eventFeed'
afterEach(()=>vi.unstubAllGlobals())
it('preserves server relevance within upcoming events and keeps past events chronological',()=>{
 const events=[{id:'relevant',starts_at:'2099-06-01'},{id:'early',starts_at:'2099-01-01'},{id:'past',event_date:'2000-01-01'},{id:'recent-past',event_date:'2001-01-01'}]
 expect(groupEventFeed(events,true,Date.parse('2026-01-01')).map(g=>g.events.map(e=>e.id))).toEqual([['relevant','early'],['recent-past','past']])
 expect(groupEventFeed(events,false,Date.parse('2026-01-01'))[0].events.map(e=>e.id)).toEqual(['early','relevant'])
 expect(events[0].id).toBe('relevant')
})
it('bypasses shared caches across account switches and sign-out',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify([{id:'event'}])))
 vi.stubGlobal('fetch',fetch)
 for(const token of ['alice','bob',null]) {
  fetch.mockResolvedValueOnce(new Response(JSON.stringify([{id:token||'guest'}])))
  expect(await loadEventFeed('/api/network/events/recommended?limit=25&offset=0',token,false,new AbortController().signal)).toEqual([{id:token||'guest'}])
 }
 expect(fetch).toHaveBeenCalledTimes(3)
 expect(fetch.mock.calls.map(c=>c[1].headers)).toEqual([{Authorization:'Bearer alice'},{Authorization:'Bearer bob'},undefined])
 for(const call of fetch.mock.calls)expect(call[1]).toMatchObject({cache:'no-store',credentials:'omit'})
})
it('reports failed and malformed feeds',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('Unavailable',{status:503})).mockResolvedValueOnce(new Response('{}')))
 await expect(loadEventFeed('/api/network/events/recommended',null,false,new AbortController().signal)).rejects.toThrow('Unavailable')
 await expect(loadEventFeed('/api/network/events/recommended',null,false,new AbortController().signal)).rejects.toThrow('unavailable')
})

it('pages every source in small batches and retains source filters',()=>{
 for(const path of ['/api/network/events/recommended?limit=500','/api/network/following/events?limit=200','/api/network/orgs/public/group/events?upcoming_only=false&limit=200']) {
  const url=new URL(eventFeedPagePath(path,25),'https://local.test')
  expect(url.searchParams.get('limit')).toBe(String(EVENT_PAGE_SIZE))
  expect(url.searchParams.get('offset')).toBe('25')
  if(path.includes('upcoming_only'))expect(url.searchParams.get('upcoming_only')).toBe('false')
 }
})
it('appends pages in ranked order and updates duplicate IDs without rendering them twice',()=>{
 const first=[{id:'relevant',title:'old'},{id:'second',title:'second'}]
 expect(appendEventPage(first,[{id:'relevant',title:'new'},{id:'third',title:'third'}])).toEqual([{id:'relevant',title:'new'},first[1],{id:'third',title:'third'}])
 expect(first[0].title).toBe('old')
})
