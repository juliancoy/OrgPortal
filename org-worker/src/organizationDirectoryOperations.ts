import { z } from 'zod';
import { type OrganizationActor } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, eventOperationStatus } from './eventOperationStore';
import { searchOrganizationDirectory, getDirectoryOrganization } from './organizations/directory';
import { runOrganizationRegistryOperation } from './organizationRegistry';
import { releaseOrganizationOwnership } from './organization-access/release';

export type OrganizationOperationContext = { actor: OrganizationActor; scopes: string[]; organizationId?: string };
export const organizationOperationStatusSchema = z.object({ organizationId: z.string().min(1).max(200), previewId: z.string().uuid() }).strict();
export type DirectoryOperation = 'search' | 'get' | 'register' | 'release' | 'status';

// REST and MCP supply trusted, authenticated context; business policy lives here.
export async function runOrganizationDirectoryOperation(db: D1Database, context: OrganizationOperationContext, operation: DirectoryOperation, input: unknown) {
  const write = operation === 'register' || operation === 'release';
  if (!context.scopes.includes('org:portal.read') || (write && !context.scopes.includes('org:portal.write')))
    throw new EventIntegrationError(403, 'Missing portal scope');
  if (operation === 'register' && context.organizationId) throw new EventIntegrationError(403, 'Directory registration requires an unrestricted connection');
  if (operation === 'release' || operation === 'status') {
    const target = z.object({ organizationId: z.string() }).passthrough().parse(input);
    if (context.organizationId && target.organizationId !== context.organizationId)
      throw new EventIntegrationError(403, 'This connection is limited to its own organization');
  }
  if (operation === 'register') return runOrganizationRegistryOperation(db, context.actor, input);
  if (operation === 'release') return releaseOrganizationOwnership(db, context.actor, input);
  await enforceEventRateLimit(db, context.actor.id);
  if (operation === 'search') return searchOrganizationDirectory(db, input);
  if (operation === 'get') return getDirectoryOrganization(db, input);
  const args = organizationOperationStatusSchema.parse(input);
  return eventOperationStatus(db, context.actor.id, args.organizationId, args.previewId);
}
