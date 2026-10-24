import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
const stages=new Set(['initialize','notifications/initialized','tools/list','tools/call','ping','unparsed','other']);
export async function recordMcpStatistics(db:D1Database,stage:string,status:number,rpcError:boolean,duration:number,invalidToken=false){
 const outcome=status===401?(invalidToken?'token_rejected':'auth_required'):status===403?'denied':status===429?'rate_limited':status>=500?'server_error':status>=400?'client_error':rpcError?'tool_error':'ok';
 const day=new Date().toISOString().slice(0,10),ms=Math.max(0,Math.min(3600000,Math.round(duration)));
 await db.prepare(`INSERT INTO mcp_live_statistics(day,stage,outcome,requests,total_ms,max_ms) VALUES(?,?,?,1,?,?)
  ON CONFLICT(day,stage,outcome) DO UPDATE SET requests=requests+1,total_ms=total_ms+excluded.total_ms,max_ms=MAX(max_ms,excluded.max_ms)`).bind(day,stages.has(stage)?stage:'other',outcome,ms,ms).run();
}
export function mcpLiveStatisticsRoutes(auth:(env:Env,request:Request)=>Promise<{is_admin?:boolean;is_sysadmin?:boolean}>){
 const app=new Hono<{Bindings:Env}>();
 app.get('/',async c=>{
  c.header('Cache-Control','no-store');const actor=await auth(c.env,c.req.raw);
  if(actor.is_admin!==true&&actor.is_sysadmin!==true)throw new HTTPException(403,{message:'Admin access required'});
  const days=Number(c.req.query('days')||7);if(![1,7,30].includes(days))throw new HTTPException(400,{message:'Choose 1, 7 or 30 days'});
  const start=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
  const rows=await c.env.DB.prepare('SELECT day,stage,outcome,requests,total_ms,max_ms FROM mcp_live_statistics WHERE day>=? AND day<=? ORDER BY day,stage,outcome').bind(start,new Date().toISOString().slice(0,10)).all();
  return c.json({source:'OrgPortal MCP',days,start,asOf:new Date().toISOString(),rows:rows.results});
 });return app;
}
