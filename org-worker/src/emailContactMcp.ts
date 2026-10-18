import { z } from 'zod';
import { requireEmailOrganizer, emailAudit } from './emailAccess';
import { contactUnsubscribeToken } from './emailContactPreferences';
import { emailPortalBase } from './emailShared';
import { EventIntegrationError } from './eventPlatforms';

export const emailContactLinkSchema = z.object({
  organizationId: z.string().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();

// Prepare a capability for this exact recipient. Never enroll a contact, change
// preferences, or send mail as a side effect of preparing a test message.
export async function prepareEmailContactLink(env: Env,
  identity: { userId: string; scopes: string[] }, input: unknown) {
  if (!identity.scopes.includes('org:portal.read') || !identity.scopes.includes('org:portal.write'))
    throw new EventIntegrationError(403, 'Missing portal scope');
  const { organizationId, email } = emailContactLinkSchema.parse(input);
  await requireEmailOrganizer(env, { id: identity.userId }, organizationId);
  const token = await contactUnsubscribeToken(env, { email, organizationId });
  const suppressed = await env.DB.prepare('SELECT 1 FROM email_contact_suppressions WHERE organization_id=? AND email=?')
    .bind(organizationId, email).first();
  await emailAudit(env, identity.userId, organizationId, 'unsubscribe-link.create').run();
  const url = new URL('/api/org/api/email/contact-unsubscribe', emailPortalBase(env));
  url.searchParams.set('token', token);
  return { organizationId, email, unsubscribeUrl: url.toString(), unsubscribed: Boolean(suppressed), sent: false };
}
