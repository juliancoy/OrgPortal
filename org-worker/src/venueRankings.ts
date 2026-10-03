import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eventVenues } from './venues';
const sameCandidates=(order:string[],ids:string[])=>order.length===ids.length&&new Set(order).size===order.length&&order.every(id=>ids.includes(id));
export async function rankingSummary(db:D1Database,eventId:string){
 const venues=await eventVenues(db,eventId),ids=venues.map(v=>v.id);
 const rows=await db.prepare('SELECT venue_ids_json FROM event_venue_rankings WHERE event_id = ?').bind(eventId).all<{venue_ids_json:string}>();
 const votes=rows.results.map(row=>JSON.parse(row.venue_ids_json) as string[]).filter(order=>sameCandidates(order,ids));
 const scores=venues.map(venue=>({...venue,points:votes.reduce((sum,order)=>sum+ids.length-order.indexOf(venue.id),0),first_place_votes:votes.filter(order=>order[0]===venue.id).length}));
 scores.sort((a,b)=>b.points-a.points||b.first_place_votes-a.first_place_votes||a.name.localeCompare(b.name));
 return {ballots_count:votes.length,venues:scores,closed:venues.some(v=>v.event_status==='confirmed')};
}
export function venueRankingRoutes(auth:(env:Env,request:Request)=>Promise<{id:string}>){
 const app=new Hono<{Bindings:Env}>();
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()});
 async function exists(db:D1Database,id:string){if(!await db.prepare('SELECT id FROM events WHERE id = ?').bind(id).first())throw new HTTPException(404,{message:'Event not found.'});}
 app.get('/:id/venue-rankings/public',async c=>{const id=c.req.param('id');await exists(c.env.DB,id);return c.json(await rankingSummary(c.env.DB,id));});
 app.get('/:id/venue-rankings',async c=>{
  const user=await auth(c.env,c.req.raw),id=c.req.param('id');await exists(c.env.DB,id);
  const row=await c.env.DB.prepare('SELECT venue_ids_json FROM event_venue_rankings WHERE event_id = ? AND user_id = ?').bind(id,user.id).first<{venue_ids_json:string}>();
  const venues=await eventVenues(c.env.DB,id),order=row?JSON.parse(row.venue_ids_json) as string[]:[];
  return c.json({venue_ids:order.filter(id=>venues.some(v=>v.id===id)),needs_update:!!row&&!sameCandidates(order,venues.map(v=>v.id))});
 });
 app.put('/:id/venue-rankings',async c=>{
  const user=await auth(c.env,c.req.raw),id=c.req.param('id');await exists(c.env.DB,id);
  const body=await c.req.json().catch(()=>null) as {venue_ids?:unknown}|null,order=body?.venue_ids;
  const venues=await eventVenues(c.env.DB,id);
  if(venues.some(v=>v.event_status==='confirmed'))throw new HTTPException(409,{message:'A venue is already confirmed; rankings are closed.'});
  if(!venues.length||!Array.isArray(order)||order.length>50||order.some(id=>typeof id!=='string')||!sameCandidates(order as string[],venues.map(v=>v.id)))throw new HTTPException(400,{message:'Rank every current candidate once. Reload if the candidate list has changed.'});
  const result=await c.env.DB.prepare(`INSERT INTO event_venue_rankings (event_id,user_id,venue_ids_json)
   SELECT ?,?,? WHERE (SELECT count(*) FROM event_venues WHERE event_id = ?) = ?
   AND NOT EXISTS (SELECT 1 FROM event_venues WHERE event_id = ? AND (status = 'confirmed' OR venue_id NOT IN (SELECT value FROM json_each(?))))
   ON CONFLICT(event_id,user_id) DO UPDATE SET venue_ids_json=excluded.venue_ids_json,updated_at=CURRENT_TIMESTAMP`).bind(id,user.id,JSON.stringify(order),id,order.length,id,JSON.stringify(order)).run();
  if(!result.meta.changes)throw new HTTPException(409,{message:'The candidate list changed. Reload and rank the current venues.'});
  return c.json({ok:true,...await rankingSummary(c.env.DB,id)});
 });
 return app;
}
