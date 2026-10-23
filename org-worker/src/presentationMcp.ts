import { z } from 'zod';
import { presentationRoutes } from './eventPresentations';
import { organizationInvitationRoutes } from './organizationInvitations';
import { authorizeOrganization } from './organizationIam';
import { validateSubmissionPresenters } from './submissionPresenters';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from './eventOperationStore';

export const presentationTargetSchema = z.object({
 organizationId: z.string().min(1).max(200).describe('Event host organization ID'),
 eventId: z.string().min(1).max(255),
}).strict();
export const presentationApplicationSchema = presentationTargetSchema.extend({
 teamOrganizationId: z.string().min(1).max(200),
 submissionId: z.string().uuid().describe('Generate once and reuse for retries; use an existing submission ID to edit'),
 title: z.string().trim().min(1).max(200), summary: z.string().trim().min(1).max(5000),
 teammates: z.array(z.union([
  z.object({userId:z.string().min(1).max(255)}).strict(),
  z.object({invitationId:z.string().min(1).max(255)}).strict(),
  z.object({email:z.string().email().max(254).transform(value=>value.toLowerCase())}).strict(),
 ])).min(1).max(50),
 previewId:z.string().uuid().optional(), confirm:z.boolean().optional(),
}).strict();

// In-process adapters reuse the browser handlers with a server-verified MCP actor.
// No tokens, scopes, actor IDs or permissions are taken from tool arguments.
export async function runPresentationOperation(env:Env, identity:{userId:string;scopes:string[]}, operation:'list'|'save', input:unknown) {
 const scopes=operation==='save'?['org:events.read','org:events.write','org:portal.read','org:portal.write']:['org:events.read'];
 if(scopes.some(scope=>!identity.scopes.includes(scope)))throw new EventIntegrationError(403,'Missing presentation scope');
 const args=operation==='save'?presentationApplicationSchema.parse(input):presentationTargetSchema.parse(input);
 const event=await env.DB.prepare('SELECT host_org_id FROM events WHERE id=?').bind(args.eventId).first<{host_org_id:string}>();
 if(!event||event.host_org_id!==args.organizationId)throw new EventIntegrationError(404,'Event not found in this organization');
 const actor={id:identity.userId,name:identity.userId,email:null,isOperator:false};
 const routes=presentationRoutes<Env>(async()=>actor);
 async function responseJson(response:Response):Promise<Record<string,unknown>> {
  const text=await response.text();
  let data:Record<string,unknown>;try{data=JSON.parse(text)}catch{data={message:text}}
  if(!response.ok)throw new EventIntegrationError(response.status,String(data.message||data.error||'Presentation request failed'));
  return data;
 }
 const path=`https://internal.invalid/${encodeURIComponent(args.eventId)}/presentations`;
 if(operation==='list')return responseJson(await routes.fetch(new Request(path),env));
 const changes=presentationApplicationSchema.parse(args);
 await authorizeOrganization(env.DB,actor,'manage',changes.teamOrganizationId);
 await enforceEventRateLimit(env.DB,actor.id);
 const existing=await env.DB.prepare('SELECT organization_id,title,summary,presenters_json,status,updated_at FROM event_submissions WHERE event_id=? AND submission_id=?').bind(args.eventId,changes.submissionId).first();
 if(existing&&existing.organization_id!==changes.teamOrganizationId)throw new EventIntegrationError(409,'Submission belongs to another team');
 // Validate explicit references before creating any invitation or saving a receipt.
 const references=changes.teammates.filter(person=>!('email' in person));
 if(references.length)await validateSubmissionPresenters(env.DB,changes.teamOrganizationId,references);
 const available=await env.DB.prepare(`SELECT 1 AS available FROM events e WHERE e.id=? AND (
  EXISTS(SELECT 1 FROM event_submissions s WHERE s.event_id=e.id AND s.submission_id=? AND s.organization_id=? AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  OR EXISTS(SELECT 1 FROM event_presentation_forms f WHERE f.event_id=e.id AND f.enabled=1 AND julianday(e.starts_at)>julianday('now'))
 )`).bind(args.eventId,changes.submissionId,changes.teamOrganizationId).first();
 if(!available)throw new EventIntegrationError(409,'Applications are closed or this submission has expired');
 const {previewId,confirm,...fields}=changes;
 const preview={...fields,before:existing||null,effects:{invitationEmails:changes.teammates.flatMap(person=>'email'in person?[person.email]:[]),publicSubmission:true}};
 const owner={userId:actor.id,organizationId:args.organizationId,eventId:args.eventId};
 const fingerprint=await previewFingerprint(preview);
 if(!confirm)return {...preview,...await prepareEventOperation(env.DB,owner,fingerprint)};
 if(!previewId)throw new EventIntegrationError(409,'Preview this application first');
 await claimEventOperation(env.DB,owner,previewId,fingerprint);
 try {
  const presenters:({userId:string}|{invitationId:string})[]=[];
  const invitations=organizationInvitationRoutes(async()=>actor);
  for(const person of changes.teammates){
   if(!('email'in person)){presenters.push(person);continue}
   const call=async(phase:string,body:unknown)=>responseJson(await invitations.fetch(new Request(`https://internal.invalid/orgs/${encodeURIComponent(changes.teamOrganizationId)}/invitations/${phase}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env));
   const body={email:person.email,purpose:'member'};
   const receipt=await call('preview',body);
   const invitation=await call('apply',{...body,previewId:receipt.previewId,confirm:true});
   if(typeof invitation.invitationId!=='string')throw new EventIntegrationError(409,'Email already has an accepted invitation; select the active team member by userId');
   presenters.push({invitationId:invitation.invitationId});
  }
  const result=await responseJson(await routes.fetch(new Request(`${path}/${encodeURIComponent(changes.submissionId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({organization_id:changes.teamOrganizationId,title:changes.title,summary:changes.summary,presenters})}),env));
  await finishEventOperation(env.DB,previewId,true,['save-presentation-application']);
  return {...result,previewId};
 }catch(error){await finishEventOperation(env.DB,previewId,false,[]);throw error}
}
