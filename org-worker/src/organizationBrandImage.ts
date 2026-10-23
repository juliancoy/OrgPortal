import {z} from 'zod';
import {EventIntegrationError} from './eventPlatforms';
const MAX_BYTES=8*1024*1024;
export const organizationImageSchema=z.object({
 dataBase64:z.string().min(4).max(Math.ceil(MAX_BYTES/3)*4),
 contentType:z.enum(['image/png','image/jpeg','image/webp','image/gif']),
 label:z.string().trim().min(1).max(160).default('Organization identity'),
 alt:z.string().trim().max(500).optional(),
}).strict();
type ImageInput=z.infer<typeof organizationImageSchema>;
export type BrandImageEnvironment={SCAN_IMAGES?:R2Bucket;PUBLIC_PORTAL_BASE_URL?:string};
export type BrandImageOrganization={id:string;slug:string;name:string;media_json:string};
function fail(status:number,message:string):never{throw new EventIntegrationError(status,message)}
function imageType(bytes:Uint8Array){
 const starts=(signature:number[])=>signature.every((value,index)=>bytes[index]===value);
 if(starts([137,80,78,71,13,10,26,10]))return ['image/png','png'];
 if(starts([255,216,255]))return ['image/jpeg','jpg'];
 const text=new TextDecoder();
 if(['GIF87a','GIF89a'].includes(text.decode(bytes.slice(0,6))))return ['image/gif','gif'];
 if(text.decode(bytes.slice(0,4))==='RIFF'&&text.decode(bytes.slice(8,12))==='WEBP')return ['image/webp','webp'];
 fail(415,'Choose a valid PNG, JPEG, WebP or GIF image.');
}
export function publicImageSource(value:string){
 const url=new URL(value),host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!host.includes('.')||host.startsWith('[')||/^[\d.]+$/.test(host)||/\.(localhost|local|internal|invalid|test)$/.test(host))fail(400,'Image imports require a public HTTPS hostname without credentials or a custom port.');
 return url;
}
async function imageBytes(source:string){
 const response=await fetch(publicImageSource(source),{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.body)fail(400,'The image could not be downloaded. Supply a direct public image URL or upload its bytes.');
 if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body.cancel();fail(413,'Image exceeds 8 MB.');}
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const row=await reader.read();if(row.done)break;size+=row.value.length;if(size>MAX_BYTES){await reader.cancel();fail(413,'Image exceeds 8 MB.');}parts.push(row.value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return bytes;
}
export async function prepareOrganizationBrandImage(env:BrandImageEnvironment,org:BrandImageOrganization,source?:string|null,input?:ImageInput,attemptId?:string){
 const media=JSON.parse(org.media_json||'[]') as Record<string,unknown>[];
 // Existing native media and linked vector logos keep their URLs.
 if(!input&&(!source||new URL(source).pathname.toLowerCase().endsWith('.svg')||media.some(item=>item.image_key&&source.endsWith(String(item.url)))))return null;
 if(!env.SCAN_IMAGES)fail(503,'Organization image storage is not configured.');
 let bytes:Uint8Array<ArrayBuffer>;
 if(input){
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.dataBase64))fail(400,'Image data must be standard base64.');
  bytes=Uint8Array.from(atob(input.dataBase64),c=>c.charCodeAt(0));
 }else bytes=await imageBytes(source!);
 if(!bytes.length||bytes.length>MAX_BYTES)fail(413,'Choose a nonempty image, 8 MB or smaller.');
 const [contentType,extension]=imageType(bytes);
 if(input&&input.contentType!==contentType)fail(415,'The image contents do not match the declared type.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const existing=media.find(item=>item.id===hash&&typeof item.image_key==='string');
 const key=existing?String(existing.image_key):`organization-media/${org.id}/${hash}-${attemptId||'preview'}.${extension}`;
 const path=`/api/network/orgs/public/${encodeURIComponent(org.slug)}/media/${hash}`;
 const base=new URL(env.PUBLIC_PORTAL_BASE_URL||'https://orgportal.cc');
 const imageUrl=new URL('/api/org'+path,base).href;
 if(!media.some(item=>item.id===hash)){
  if(media.length>=12)fail(409,'The organization gallery is full. Remove an image before uploading another.');
  media.push({id:hash,url:path,label:input?.label||'Organization identity',alt:input?.alt||`${org.name} identity`,kind:'image',content_type:contentType,image_key:key});
 }
 return {imageUrl,mediaJson:JSON.stringify(media),summary:{sha256:hash,contentType,size:bytes.length,source:input?'uploaded bytes':source},
  publish:()=>existing?Promise.resolve(null):env.SCAN_IMAGES!.put(key,bytes,{httpMetadata:{contentType},customMetadata:{organization_id:org.id}}),key,ownsObject:!existing};
}
