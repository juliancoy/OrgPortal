import { z } from 'zod';
import { authorizeOrganization, organizationRole } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation, eventOperationStatus } from './eventOperationStore';

export type GovernanceAction = 'propose' | 'second' | 'open-voting' | 'table' | 'withdraw' | 'vote' | 'resolve' | 'comment';
const organizationId = z.string().trim().min(1).max(120);
const motionId = z.string().trim().min(1).max(120);
const receipt = { previewId: z.string().uuid().optional(), confirm: z.boolean().optional() };
export const motionListSchema = z.object({ organizationId, search: z.string().max(500).optional(),
  status: z.enum(['proposed', 'seconded', 'discussion', 'voting', 'passed', 'failed', 'tabled', 'withdrawn']).optional(),
  limit: z.number().int().min(1).max(500).default(100) }).strict();
export const motionTargetSchema = z.object({ organizationId, motionId }).strict();
export const motionOperationSchema = z.object({ organizationId, previewId: z.string().uuid() }).strict();
export const proposeMotionSchema = z.object({ organizationId, title: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(50000), quorumRequired: z.number().int().min(1).max(1000000).default(5),
  ...receipt }).strict();
export const amendMotionSchema = proposeMotionSchema.extend({ parentMotionId: motionId,
  proposedBodyDiff: z.string().max(50000).optional() });
export const motionActionSchema = motionTargetSchema.extend({
  action: z.enum(['second', 'open-voting', 'table', 'withdraw', 'vote', 'resolve', 'comment']),
  choice: z.enum(['yea', 'nay', 'abstain']).optional(), body: z.string().trim().min(1).max(10000).optional(), ...receipt,
}).superRefine((args, ctx) => {
  if (args.action === 'vote' ? !args.choice : args.choice !== undefined) ctx.addIssue({ code: 'custom', message: 'choice is required only for vote', path: ['choice'] });
  if (args.action === 'comment' ? !args.body : args.body !== undefined) ctx.addIssue({ code: 'custom', message: 'body is required only for comment', path: ['body'] });
});
export type GovernanceService = {
  read: (operation: 'list' | 'get', organizationId: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  execute: (userId: string, action: GovernanceAction, motionId: string | null, payload: Record<string, unknown>) => Promise<unknown>;
};

export async function runGovernanceOperation(db: D1Database, identity: { userId: string; scopes: string[] },
  operation: 'list' | 'get' | 'status' | 'propose' | 'amend' | 'action', input: unknown, service: GovernanceService) {
  const write = ['propose', 'amend', 'action'].includes(operation);
  if (!identity.scopes.includes('org:portal.read') || (write && !identity.scopes.includes('org:portal.write'))) {
    throw new EventIntegrationError(403, 'Missing portal scope');
  }
  const schema = operation === 'list' ? motionListSchema : operation === 'get' ? motionTargetSchema
    : operation === 'status' ? motionOperationSchema : operation === 'propose' ? proposeMotionSchema
    : operation === 'amend' ? amendMotionSchema : motionActionSchema;
  const args = schema.parse(input);
  const role = await organizationRole(db, args.organizationId, identity.userId);
  if (!role) throw new EventIntegrationError(403, 'Active organization membership required');
  await enforceEventRateLimit(db, identity.userId);
  if (operation === 'status') return await eventOperationStatus(db, identity.userId, args.organizationId,
    (args as z.infer<typeof motionOperationSchema>).previewId);
  if (operation === 'list' || operation === 'get') return await service.read(operation, args.organizationId, args);

  const { confirm, previewId, ...changes } = args as z.infer<typeof motionActionSchema>;
  const action: GovernanceAction = operation === 'action' ? changes.action : 'propose';
  const proposal = args as z.infer<typeof amendMotionSchema>;
  const target = operation === 'action' ? changes.motionId : operation === 'amend' ? proposal.parentMotionId : null;
  const before = target ? await service.read('get', args.organizationId, { motionId: target }) : null;
  const motion = before?.motion as Record<string, unknown> | undefined;
  if (['open-voting', 'table', 'resolve'].includes(action)) {
    await authorizeOrganization(db, { id: identity.userId, name: identity.userId, email: null, isOperator: false }, 'manage', args.organizationId);
  }
  if (action === 'withdraw' && motion?.proposer_id !== identity.userId) throw new EventIntegrationError(403, 'Only the proposer can withdraw this motion');
  if (action === 'second' && motion?.proposer_id === identity.userId) throw new EventIntegrationError(400, 'Proposer cannot second their own motion');
  const allowed: Partial<Record<GovernanceAction, string[]>> = {
    second: ['proposed'], 'open-voting': ['discussion', 'seconded'], table: ['discussion'],
    withdraw: ['proposed'], vote: ['voting'], resolve: ['voting'],
  };
  if (motion && allowed[action] && !allowed[action]!.includes(String(motion.status))) throw new EventIntegrationError(409, 'Motion is not in the required state for this action');
  if (operation === 'amend' && !['proposed', 'seconded', 'discussion', 'tabled'].includes(String(motion?.status))) throw new EventIntegrationError(409, 'Amendments require a motion that is still under consideration');
  const payload: Record<string, unknown> = operation === 'action' ? { choice: changes.choice, body: changes.body } : {
    title: proposal.title, body: proposal.body, quorum_required: proposal.quorumRequired,
    proposer_type: 'user', proposer_org_id: args.organizationId,
    type: operation === 'amend' ? 'amendment' : 'main',
    parent_motion_id: operation === 'amend' ? proposal.parentMotionId : undefined,
    proposed_body_diff: operation === 'amend' ? proposal.proposedBodyDiff : undefined,
  };
  const preview = { operation, action, organizationId: args.organizationId, motionId: target, changes: payload, before };
  const owner = { userId: identity.userId, organizationId: args.organizationId, eventId: `governance:${operation}:${target || 'new'}` };
  const fingerprint = await previewFingerprint(preview);
  if (!confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(db, owner, previewId, fingerprint);
  try {
    const result = await service.execute(identity.userId, action, operation === 'action' ? target : null, payload);
    await finishEventOperation(db, previewId, true, [action]);
    return { result, previewId };
  } catch (error) {
    await finishEventOperation(db, previewId, false, []);
    throw error;
  }
}
