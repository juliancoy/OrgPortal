import {describe,expect,it} from 'vitest'
import {organizationCalendarEvents} from './organizationEvents'

describe('organization calendar',()=>{
 it('shows presenting and hosted events in one chronological list without changing the host',()=>{
  const events=[
   {id:'hosted',host_org_id:'team',starts_at:'2026-12-01'},
   {id:'demo',host_org_id:'lifetech',starts_at:'2026-11-17'},
   {id:'undated',host_org_id:'team'},
   {id:'date-only',host_org_id:'team',event_date:'2026-11-01'},
  ]
  expect(organizationCalendarEvents(events).map(event=>event.id)).toEqual(['date-only','demo','hosted','undated'])
  expect(organizationCalendarEvents(events).find(event=>event.id==='demo')?.host_org_id).toBe('lifetech')
  expect(events[0].id).toBe('hosted')
 })
 it('shows an event only once when the organization has multiple associations',()=>{
  const event={id:'demo',starts_at:'2026-11-17'}
  expect(organizationCalendarEvents([event,event])).toEqual([event])
  expect(organizationCalendarEvents([])).toEqual([])
 })
})
