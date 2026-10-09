import { z } from 'zod';
import { authorizeOrganization } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint } from './eventOperationStore';
import { companyVoteSummary, eventBallot, favoriteLimit, ownCompanyVotes, saveCompanyVote } from './companyVotes';

const target = { organizationId: z.string().min(1).max(200), eventId: z.string().min(1).max(200) };
const receipt = { previewId: z.string().uuid().optional(), confirm: z.boolean().optional() };
export const companyVotesTargetSchema = z.object(target).strict();
export const companyBallotSchema = z.object({ ...target, ...receipt, mode: z.enum(['up_down','favorites']), selectionFraction: z.number().gt(0).max(1).default(0.25) }).strict();
export const companyVoteSchema = z.object({ ...target, ...receipt, companyId: z.string().min(1).max(200), value: z.union([z.literal(-1),z.literal(0),z.literal(1)]), mode: z.enum(['up_down','favorites']) }).strict();
type Identity = { userId: string; scopes: string[] };
async function checkTarget(env: Env, identity: Identity, args: { organizationId: string; eventId: string; confirm?: boolean }, manage = false) {
  if (!identity.scopes.includes('org:events.read') || (args.confirm && !identity.scopes.includes('org:events.write'))) throw new EventIntegrationError(403, 'Missing event scope');
  const event = await env.DB.prepare('SELECT id,title,host_org_id FROM events WHERE id = ?').bind(args.eventId).first<{id:string;title:string;host_org_id:string|null}>();
  if (!event || event.host_org_id !== args.organizationId) throw new EventIntegrationError(404, 'Event not found in this organization');
  if (manage) await authorizeOrganization(env.DB, { id: identity.userId, name: identity.userId, email: null, isOperator: false }, 'manage', args.organizationId);
  return event;
}
export async function getCompanyVotes(env: Env, identity: Identity, input: unknown) {
  const args = companyVotesTargetSchema.parse(input);
  await checkTarget(env, identity, args);
  return { ...await companyVoteSummary(env.DB,args.eventId), ...await ownCompanyVotes(env.DB,args.eventId,identity.userId) };
}
export async function runCompanyBallotOperation(env: Env, identity: Identity, input: unknown) {
  const args = companyBallotSchema.parse(input);
  const event = await checkTarget(env,identity,args,true);
  const before = await eventBallot(env.DB,args.eventId);
  if (!before) throw new EventIntegrationError(404,'Configure the event’s pitching roster and closing date first');
  await enforceEventRateLimit(env.DB,identity.userId);
  const roster = (await env.DB.prepare('SELECT organization_id FROM event_pitch_companies WHERE event_id = ? ORDER BY organization_id').bind(args.eventId).all<{organization_id:string}>()).results.map(row=>row.organization_id);
  const limit = favoriteLimit(roster.length,args.selectionFraction);
  const preview = { eventId: event.id, title: event.title, organizationId: args.organizationId, before,
    changes: { mode: args.mode, selection_fraction: args.selectionFraction }, companyIds: roster,
    selectionLimit: args.mode === 'favorites' ? limit : null, existingPreferences: 'Preserved separately for each voting mode.' };
  const owner = { userId: identity.userId, organizationId: args.organizationId, eventId: `company-ballot:${args.eventId}` };
  const fingerprint = await previewFingerprint(preview);
  if (!args.confirm) return { ...preview, ...await prepareEventOperation(env.DB,owner,fingerprint) };
  if (!args.previewId) throw new EventIntegrationError(409,'Preview the voting configuration first');
  await claimEventOperation(env.DB,owner,args.previewId,fingerprint);
  try {
    // Refuse a smaller budget that would invalidate an existing account's saved favorites.
    const changed = await env.DB.prepare(`UPDATE event_company_ballots SET mode = ?,selection_fraction = ?
      WHERE event_id = ? AND mode = ? AND selection_fraction = ? AND closes_at = ? AND enabled = ?
      AND EXISTS (SELECT 1 FROM events WHERE id = ? AND host_org_id = ?)
      AND (SELECT COUNT(*) FROM event_pitch_companies WHERE event_id = ?) = ?
      AND NOT EXISTS (SELECT 1 FROM event_pitch_companies WHERE event_id = ? AND organization_id NOT IN (SELECT value FROM json_each(?)))
      AND (? != 'favorites' OR NOT EXISTS (SELECT user_id FROM event_company_favorites WHERE event_id = ?
        AND julianday(expires_at) > julianday('now') GROUP BY user_id HAVING COUNT(*) > ?))`)
      .bind(args.mode,args.selectionFraction,args.eventId,before.mode,before.selection_fraction,before.closes_at,before.enabled,
        args.eventId,args.organizationId,args.eventId,roster.length,args.eventId,JSON.stringify(roster),args.mode,args.eventId,limit).run();
    if (changed.meta.changes !== 1) throw new EventIntegrationError(409,'Configuration changed or the new budget is below saved favorites. Request a fresh preview with a sufficient budget.');
    await finishEventOperation(env.DB,args.previewId,true,['configure_company_ballot']);
    return { success: true, previewId: args.previewId, ...await companyVoteSummary(env.DB,args.eventId) };
  } catch (error) { await finishEventOperation(env.DB,args.previewId,false,[]); throw error; }
}
export async function runCompanyVoteOperation(env: Env, identity: Identity, input: unknown) {
  const args = companyVoteSchema.parse(input);
  await checkTarget(env,identity,args);
  await enforceEventRateLimit(env.DB,identity.userId);
  const summary = await companyVoteSummary(env.DB,args.eventId);
  if (!summary.available || !summary.companies.some(company=>company.id === args.companyId)) throw new EventIntegrationError(404,'Pitching company not found');
  if (summary.mode !== args.mode) throw new EventIntegrationError(409,'Voting mode changed. Read votes again.');
  if (args.mode === 'favorites' && args.value === -1) throw new EventIntegrationError(400,'Favorites voting has no downvotes');
  const own = await ownCompanyVotes(env.DB,args.eventId,identity.userId);
  const preview = { eventId: args.eventId, organizationId: args.organizationId, companyId: args.companyId, value: args.value,
    mode: summary.mode, selectionLimit: summary.selection_limit, closesAt: summary.closes_at, closed: summary.closed, before: own.votes };
  const owner = { userId: identity.userId, organizationId: args.organizationId, eventId: `company-vote:${args.eventId}:${args.companyId}` };
  const fingerprint = await previewFingerprint(preview);
  if (!args.confirm) return { ...preview, ...await prepareEventOperation(env.DB,owner,fingerprint) };
  if (!args.previewId) throw new EventIntegrationError(409,'Preview your vote first');
  await claimEventOperation(env.DB,owner,args.previewId,fingerprint);
  try {
    const saved = await saveCompanyVote(env.DB,args.eventId,args.companyId,identity.userId,args.value,args.mode);
    await finishEventOperation(env.DB,args.previewId,true,['save_company_vote']);
    return { success: true, previewId: args.previewId, ...saved };
  } catch (error) { await finishEventOperation(env.DB,args.previewId,false,[]); throw error; }
}
