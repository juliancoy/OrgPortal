import { z } from 'zod';
import { presentationTargetSchema } from './presentationMcp';
import { presentationFinalRoundRoutes } from './presentationFinalRound';
import { presentationVotingWindow } from './presentationVotingWindow';
import { authorizeOrganization } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation } from './eventOperationStore';

export const presentationVotingSchema = presentationTargetSchema.extend({
 phase:z.enum(['shortlist','open','closed']),
 finalistIds:z.array(z.string().min(1).max(200)).min(1).max(20).refine(ids=>new Set(ids).size===ids.length,'Choose different finalists'),
 previewId:z.string().uuid().optional(),confirm:z.boolean().optional(),
}).strict();

export async function runPresentationVotingOperation(env:Env,identity:{userId:string;scopes:string[]},input:unknown) {
 if(!identity.scopes.includes('org:events.read')||!identity.scopes.includes('org:events.write'))throw new EventIntegrationError(403,'Missing event scope');
 const args=presentationVotingSchema.parse(input);
 const event=await env.DB.prepare('SELECT id,title,host_org_id,starts_at,ends_at FROM events WHERE id=?').bind(args.eventId).first<{id:string;title:string;host_org_id:string;starts_at:string|null;ends_at:string|null}>();
 if(!event||event.host_org_id!==args.organizationId)throw new EventIntegrationError(404,'Event not found in this organization');
 const actor={id:identity.userId,name:identity.userId,email:null,isOperator:false};
 await authorizeOrganization(env.DB,actor,'manage',args.organizationId);
 await enforceEventRateLimit(env.DB,actor.id);
 const window=presentationVotingWindow(event);
 if(args.phase==='open'&&window.votingClosed)throw new EventIntegrationError(409,'Voting closed one week after the event ended.');
 const before=await env.DB.prepare('SELECT phase,finalist_ids_json,expires_at FROM event_presentation_final_rounds WHERE event_id=?').bind(event.id).first<{phase:string;finalist_ids_json:string;expires_at:string}>();
 const finalistIds=[...args.finalistIds].sort();
 const locked=before&&before.phase!=='shortlist';
 if(locked&&(args.phase==='shortlist'||before.finalist_ids_json!==JSON.stringify(finalistIds)))throw new EventIntegrationError(409,'Finalists cannot change after voting opens');
 if(args.phase==='closed'&&!locked)throw new EventIntegrationError(409,'Open final voting before closing it');
 const candidates=(await env.DB.prepare(`SELECT s.submission_id,s.title,o.name AS organization_name FROM event_submissions s JOIN organizations o ON o.id=s.organization_id
  WHERE s.event_id=? AND s.submission_id IN (SELECT value FROM json_each(?)) AND s.status!='declined' AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY s.submission_id`).bind(event.id,JSON.stringify(finalistIds)).all()).results;
 if(!locked&&candidates.length!==finalistIds.length)throw new EventIntegrationError(409,'Finalists must be available submissions from this event');
 const preview={organizationId:args.organizationId,eventId:event.id,title:event.title,before,changes:{phase:args.phase,finalistIds},...window,candidates,existingVotes:'Existing stars and final ballots are preserved separately. Opening final voting lets each attendee choose one finalist.'};
 const owner={userId:actor.id,organizationId:args.organizationId,eventId:`presentation-voting:${event.id}`};
 const fingerprint=await previewFingerprint(preview);
 if(!args.confirm)return {...preview,...await prepareEventOperation(env.DB,owner,fingerprint)};
 if(!args.previewId)throw new EventIntegrationError(409,'Preview the voting configuration first');
 await claimEventOperation(env.DB,owner,args.previewId,fingerprint);
 try {
  const routes=presentationFinalRoundRoutes<Env>(async()=>actor,{startsAt:event.starts_at,endsAt:event.ends_at,before});
  const response=await routes.fetch(new Request(`https://internal.invalid/${encodeURIComponent(event.id)}/presentations/final-round`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(preview.changes)}),env);
  if(!response.ok)throw new EventIntegrationError(response.status,'Voting configuration changed. Request a fresh preview.');
  await finishEventOperation(env.DB,args.previewId,true,['configure_presentation_voting']);
  return {success:true,previewId:args.previewId,...preview.changes,...window};
 } catch(error) {await finishEventOperation(env.DB,args.previewId,false,[]);throw error}
}
