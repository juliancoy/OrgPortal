// Serve the real site Worker locally, including domain-root portal routing.
// Pair with org-worker/test/helpers/timebankServer.ts on TIMEBANK_TEST_PORT.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import site from '../../../cloudflare/worker.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const assets=path.join(root,'.cloudflare/site');
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>nativeFetch(input,options?.body?{...options,duplex:'half'}:options);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm'};
const upstream=`http://127.0.0.1:${process.env.TIMEBANK_TEST_PORT || 8794}`;
const env={ORG_API_ORIGIN:upstream,PIDP_PROXY_ORIGIN:upstream,CHAT_API_ORIGIN:upstream,ASSETS:{fetch:async(request)=>{
 const pathname=new URL(request.url).pathname;
 const file=path.resolve(assets,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(assets+path.sep))return new Response('Not found',{status:404});
 try{return new Response(await readFile(file),{headers:{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
}}};
createServer(async(req,res)=>{
 try {
  const body=[];for await(const chunk of req)body.push(chunk);
  const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body:Buffer.concat(body)}:{})});
  const response=await site.fetch(request,env, {waitUntil:()=>{}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 } catch {res.writeHead(500);res.end('Local site fixture failed');}
}).listen(Number(process.env.TIMEBANK_SITE_PORT || 5179),'0.0.0.0',()=>console.log('Timebank site fixture ready'));
