import { z } from 'zod';
export const emailContentSchema = z.object({
 heading:z.string().max(160).default(''),tagline:z.string().max(160).default(''),sender_name:z.string().max(120).regex(/^[^\r\n\0]*$/).default(''),
 accent:z.string().regex(/^#[0-9a-f]{6}$/i).default('#155e59'),
 logo_url:z.string().max(2000).default('').refine(v=>!v||https(v),'Use an HTTPS image URL'),
 rsvp_url:z.string().max(2000).default('').refine(v=>!v||https(v),'Use an HTTPS RSVP URL'),
 rsvp_label:z.string().max(80).default('RSVP'),postal_address:z.string().max(300).default(''),
 image_data:z.string().max(410000).default('').refine(v=>!v||validImage(v),'Choose a JPEG or PNG under 300 KB'),
}).strict();
function https(v:string){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}}
function validImage(v:string){const m=v.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);if(!m)return false;try{const s=atob(m[2]);return s.length<=300000&&(m[1]==='jpeg'?s.startsWith('\xff\xd8\xff'):s.startsWith('\x89PNG\r\n\x1a\n'))}catch{return false}}
export type EmailContent=z.infer<typeof emailContentSchema>;
export function emailContent(value?:string|null){return emailContentSchema.parse(value?JSON.parse(value):{});}
