import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
export type VenueRow={id:string;name:string;description:string|null;image_url:string|null;image_source_url:string|null;image_credit:string|null;research_url:string|null;researched_at:string|null;address:string|null;website:string|null;amenities:string|null;capacity:string|null;cost:string|null;opening_hours:string|null;category:string;status:string;organization_id:string|null;created_by_user_id:string|null;contact_name:string|null;contact_email:string|null;contact_phone:string|null;notes:string|null;source_url:string|null;source_rows_json:string};
const bad=(message:string)=>{throw new HTTPException(400,{message});};
const fields=['description','image_url','image_source_url','image_credit','research_url','researched_at','name','address','website','amenities','capacity','cost','opening_hours','category','status','contact_name','contact_email','contact_phone','notes'] as const;
export function venueInput(body:Record<string,unknown>){
 if(!body||typeof body!=='object'||Array.isArray(body))bad('Invalid venue.');
 const values:Record<string,string|null>={};
 for(const field of fields){if(!(field in body))continue;const value=body[field];if(value!==null&&typeof value!=='string')bad(`Invalid ${field}.`);if(typeof value==='string'&&value.length>5000)bad(`${field} is too long.`);values[field]=typeof value==='string'?value.trim()||null:null;}
 if('name' in values&&!values.name)bad('Venue name is required.');
 if('status' in values&&!['active','inactive'].includes(values.status||''))bad('Choose active or inactive.');
 for(const field of ['website','image_url','image_source_url','research_url']){if(values[field]){try{const url=new URL(values[field]!);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)bad(`Use a public HTTP or HTTPS ${field}.`);}catch{bad(`Invalid ${field}.`);}}}
 if(values.researched_at&&(!/^\d{4}-\d{2}-\d{2}$/.test(values.researched_at)||!Number.isFinite(Date.parse(values.researched_at))||new Date(values.researched_at).toISOString().slice(0,10)!==values.researched_at))bad('Use a valid YYYY-MM-DD research date.');
 return values;
}
export function publicVenue(row:VenueRow){return {id:row.id,name:row.name,description:row.description,image_url:row.image_url,image_source_url:row.image_source_url,image_credit:row.image_credit,research_url:row.research_url,researched_at:row.researched_at,address:row.address,website:row.website,amenities:row.amenities,capacity:row.capacity,cost:row.cost,opening_hours:row.opening_hours,category:row.category,status:row.status,source_url:row.source_url};}
export async function eventVenues(db:D1Database,eventId:string){
 const rows=await db.prepare('SELECT v.*,ev.status AS event_status FROM event_venues ev JOIN venues v ON v.id = ev.venue_id WHERE ev.event_id = ? ORDER BY ev.status DESC,v.name').bind(eventId).all<VenueRow&{event_status:string}>();
 return rows.results.map(row=>({...publicVenue(row),event_status:row.event_status}));
}
export async function setEventVenues(db:D1Database,eventId:string,body:Record<string,unknown>){
 if(!body||typeof body!=='object'||Array.isArray(body))bad('Invalid venue selection.');
 const ids=body.candidate_venue_ids,confirmed=body.confirmed_venue_id;
 if(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)bad('Choose up to 50 unique candidate venues.');
 if(confirmed!==null&&confirmed!==undefined&&(typeof confirmed!=='string'||!confirmed))bad('Invalid confirmed venue.');
 const all=[...new Set([...(ids as string[]),...(confirmed?[confirmed as string]:[])])];
 const rows=all.length?(await db.prepare(`SELECT * FROM venues WHERE status = 'active' AND id IN (${all.map(()=>'?').join(',')})`).bind(...all).all<VenueRow>()).results:[];
 if(rows.length!==all.length)bad('One or more venues are missing or inactive.');
 const venue=rows.find(row=>row.id===confirmed);
 await db.batch([
  db.prepare('DELETE FROM event_venues WHERE event_id = ?').bind(eventId),
  ...all.map(id=>db.prepare('INSERT INTO event_venues (event_id,venue_id,status) VALUES (?,?,?)').bind(eventId,id,id===confirmed?'confirmed':'candidate')),
  db.prepare('UPDATE events SET location = ?,updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(venue?[venue.name,venue.address].filter(Boolean).join(' · '):null,eventId)
 ]);
 return eventVenues(db,eventId);
}
export function venueRoutes<User extends {id:string}>(auth:(env:Env,request:Request)=>Promise<User>,manage:(env:Env,user:User,venue:VenueRow)=>Promise<void>){
 const app=new Hono<{Bindings:Env}>();
 app.get('/public',async c=>{const q=(c.req.query('q')||'').trim().slice(0,200);const rows=await c.env.DB.prepare("SELECT * FROM venues WHERE name LIKE ? OR address LIKE ? ORDER BY name LIMIT 500").bind('%'+q+'%','%'+q+'%').all<VenueRow>();return c.json(rows.results.map(publicVenue));});
 app.get('/public/:id',async c=>{const row=await c.env.DB.prepare('SELECT * FROM venues WHERE id = ?').bind(c.req.param('id')).first<VenueRow>();if(!row)throw new HTTPException(404);return c.json(publicVenue(row));});
 app.post('/',async c=>{const user=await auth(c.env,c.req.raw);const input=venueInput(await c.req.json());if(!input.name)bad('Venue name is required.');const id=crypto.randomUUID();const keys=Object.keys(input);await c.env.DB.prepare(`INSERT INTO venues (id,created_by_user_id,${keys.join(',')}) VALUES (?,?,${keys.map(()=>'?').join(',')})`).bind(id,user.id,...Object.values(input)).run();return c.json({id},201);});
 app.get('/:id/manage',async c=>{const user=await auth(c.env,c.req.raw);const row=await c.env.DB.prepare('SELECT * FROM venues WHERE id = ?').bind(c.req.param('id')).first<VenueRow>();if(!row)throw new HTTPException(404);await manage(c.env,user,row);c.header('Cache-Control','no-store');return c.json(row);});
 app.patch('/:id',async c=>{const user=await auth(c.env,c.req.raw);const row=await c.env.DB.prepare('SELECT * FROM venues WHERE id = ?').bind(c.req.param('id')).first<VenueRow>();if(!row)throw new HTTPException(404);await manage(c.env,user,row);const input=venueInput(await c.req.json());if(Object.keys(input).length)await c.env.DB.prepare(`UPDATE venues SET ${Object.keys(input).map(key=>key+' = ?').join(',')},updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...Object.values(input),row.id).run();return c.json({ok:true});});
 return app;
}
