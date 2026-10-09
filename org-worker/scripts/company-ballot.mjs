#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { browserLogin } from './event-upload.mjs';
import { credentialStore } from './upload-connection.mjs';
const {values}=parseArgs({options:{
 resource:{type:'string',default:'https://lifetech.fyi/api/org/mcp'},issuer:{type:'string',default:'https://id.codecollective.us'},connection:{type:'string'},
 event:{type:'string'},organization:{type:'string'},mode:{type:'string',default:'favorites'},fraction:{type:'string',default:'0.25'},
 get:{type:'boolean'},apply:{type:'boolean'},'preview-id':{type:'string'},
}});
if(!values.event||!values.organization||(values.apply&&!values['preview-id']))throw Error('company-ballot.mjs --event ID --organization ID [--mode favorites|up_down] [--fraction 0.25] [--get | --apply --preview-id UUID]');
let store,connection,client;
try {
 store=await credentialStore(values.resource,values.issuer,values.connection);
 if(!(await store.load())?.refreshToken)throw Error('Sign in first: orgportal auth login');
 connection=await browserLogin(values.resource,values.issuer,undefined,false,{store,scope:'org:events.read org:events.write'});
 client=new Client({name:'orgportal-company-ballot',version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(values.resource),{fetch:async(url,init)=>{
  const headers=new Headers(init?.headers);headers.set('authorization',`Bearer ${await connection.accessToken()}`);
  return fetch(url,{...init,headers});
 }}));
 const args={eventId:values.event,organizationId:values.organization,...(values.get?{}:{mode:values.mode,selectionFraction:Number(values.fraction)}),...(values.apply?{confirm:true,previewId:values['preview-id']}:{})};
 const result=await client.callTool({name:values.get?'get_event_company_votes':values.apply?'apply_event_company_ballot':'preview_event_company_ballot',arguments:args});
 if(result.isError)throw Error(result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n'));
 console.log(JSON.stringify(result.structuredContent||JSON.parse(result.content.find(item=>item.type==='text').text),null,2));
} catch(error){console.error(error.message);process.exitCode=1;}
finally{await client?.close();await connection?.close();await store?.release();}
