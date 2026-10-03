import { z } from 'zod';
import { authorizeOrganization } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, claimEventOperation, finishEventOperation, previewFingerprint } from './eventOperationStore';
import { publicVenue, venueInput, type VenueRow } from './venues';
const httpsUrl = z.string().trim().min(1).max(2000).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}, 'Public HTTPS URL required');
export const venueImageSchema = z.object({
  organizationId: z.string().min(1).max(200), venueId: z.string().min(1).max(200),
  imageUrl: httpsUrl, imageSourceUrl: httpsUrl, imageCredit: z.string().trim().min(1).max(200),
  previewId: z.string().uuid().optional(), confirm: z.boolean().optional(),
}).strict();
export async function runVenueImageOperation(env: Env, identity: { userId: string; scopes: string[] }, input: unknown) {
  const args = venueImageSchema.parse(input);
  if (!identity.scopes.includes('org:events.read') || (args.confirm && !identity.scopes.includes('org:events.write'))) throw new EventIntegrationError(403, 'Missing event scope');
  await authorizeOrganization(env.DB, { id: identity.userId, name: identity.userId, email: null, isOperator: false }, 'manage', args.organizationId);
  const venue = await env.DB.prepare('SELECT * FROM venues WHERE id = ? AND organization_id = ?').bind(args.venueId, args.organizationId).first<VenueRow>();
  if (!venue) throw new EventIntegrationError(404, 'Organization venue not found');
  await enforceEventRateLimit(env.DB, identity.userId);
  const changes = venueInput({ image_url: args.imageUrl, image_source_url: args.imageSourceUrl, image_credit: args.imageCredit });
  const before = { image_url: venue.image_url, image_source_url: venue.image_source_url, image_credit: venue.image_credit };
  const preview = { organizationId: args.organizationId, venueId: venue.id, name: venue.name, before, changes };
  const owner = { userId: identity.userId, organizationId: args.organizationId, eventId: `venue-image:${venue.id}` };
  const fingerprint = await previewFingerprint({ venueImage: preview });
  if (!args.confirm) return { ...preview, ...await prepareEventOperation(env.DB, owner, fingerprint) };
  if (!args.previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(env.DB, owner, args.previewId, fingerprint);
  let completed: string[] = [];
  try {
    // Compare previewed image fields and ownership atomically; preserve intervening edits.
    const saved = await env.DB.prepare(`UPDATE venues SET image_url = ?,image_source_url = ?,image_credit = ?,updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND organization_id = ? AND image_url IS ? AND image_source_url IS ? AND image_credit IS ?`)
      .bind(changes.image_url, changes.image_source_url, changes.image_credit, venue.id, args.organizationId, before.image_url, before.image_source_url, before.image_credit).run();
    if (saved.meta.changes !== 1) throw new EventIntegrationError(409, 'Venue changed after preview; request a fresh preview');
    completed = ['update_venue_image'];
    const actual = await env.DB.prepare('SELECT * FROM venues WHERE id = ?').bind(venue.id).first<VenueRow>();
    if (!actual) throw new Error('Saved venue not found');
    await finishEventOperation(env.DB, args.previewId, true, completed);
    return { success: true, previewId: args.previewId, completed, venue: publicVenue(actual) };
  } catch {
    try { await finishEventOperation(env.DB, args.previewId, false, completed); } catch { /* receipt remains inspectable */ }
    return { success: false, previewId: args.previewId, completed, outcomeUncertain: true, message: 'Inspect the venue and operation receipt before requesting another preview.' };
  }
}
