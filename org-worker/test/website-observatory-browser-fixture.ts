// Isolated browser fixture. This entrypoint is never imported by the Worker.
import { createServer } from 'node:http';
import { HTTPException } from 'hono/http-exception';
import { websiteObservatoryRoutes } from '../src/websiteObservatory';
const objects=new Map<string,any>();
const storage={async put(key:string,value:string,options?:any){objects.set(key,{value,customMetadata:options?.customMetadata});},async get(key:string){const o=objects.get(key);return o?{json:async()=>JSON.parse(o.value)}:null;},async delete(key:string|string[]){for(const k of Array.isArray(key)?key:[key])objects.delete(k);},async list(options:any){return {objects:[...objects.entries()].filter(([key])=>key.startsWith(options.prefix)&&(!options.startAfter||key>options.startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,options.limit).map(([key,o])=>({key,customMetadata:o.customMetadata})),truncated:false};}};
const env={SCAN_IMAGES:storage,WEBSITE_OBSERVATORY_TOKEN:'fixture-collector'} as unknown as Env;
const app=websiteObservatoryRoutes(async(_env,request)=>{const auth=request.headers.get('authorization');if(!auth)throw new HTTPException(401);return {is_sysadmin:auth==='Bearer fixture-admin'};});
for(const site of ['https://codecollective.us/','https://lifetech.fyi/']){
 const record={schema_version:1,site,observed:new Date().toISOString(),duration_seconds:6,requests:['https://fonts.googleapis.com','https://lh3.googleusercontent.com',new URL(site).origin].map(origin=>({origin,method:'GET',type:'script',status:200,bytes:1024,duration_ms:20,error:null,blocked:null})),initiators:[],metrics:{fcp_ms:200},navigation_error:null,javascript_errors:0,final_origin:new URL(site).origin,evidence:'synthetic_browser',vantage:'isolated fixture',coverage:'isolated fixture'};
 await app.fetch(new Request('http://fixture/collector',{method:'POST',headers:{authorization:'Bearer fixture-collector','content-type':'application/json'},body:JSON.stringify(record)}),env);
}
createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const url='http://127.0.0.1:19879'+(req.url||'/').replace('/api/org/api/admin/website-observatory','');const response=await app.fetch(new Request(url,{method:req.method,headers:req.headers as HeadersInit,...body.length?{body,duplex:'half'}:{}} as RequestInit),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}}).listen(19879,'127.0.0.1',()=>console.log('Isolated fixture listening'));
