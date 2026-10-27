import { z } from 'zod';
import { emailAudit, requireEmailOrganizer } from './emailAccess';
import { emailContentSchema } from './emailContent';
import { senderFor } from './emailGoogle';
import { emailFail, emailFromAddress, emailPortalBase, type EmailCampaign, type EmailEvent } from './emailShared';
import { renderCampaign } from './emailTemplate';
import { EventIntegrationError } from './eventPlatforms';
import { claimEventOperation, finishEventOperation, prepareEventOperation, previewFingerprint } from './eventOperationStore';

const target = z.object({ organizationId: z.string().min(1).max(200) }).strict();
const receipt = { previewId: z.string().uuid().optional(), confirm: z.boolean().optional() };
export const emailWorkspaceSchema = target;
export const emailSubscriberSchema = target.extend({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(255).default('Subscriber'),
  source: z.string().trim().min(1).max(200),
  ...receipt,
}).strict();
export const emailDraftSchema = target.extend({
  subject: z.string().trim().min(1).max(200).regex(/^[^\r\n\0]+$/),
  body: z.string().trim().min(1).max(20000),
  audience: z.enum(['email-only', 'organization']).default('email-only'),
  eventId: z.string().min(1).max(200).optional(),
  content: emailContentSchema.omit({ image_data: true }).prefault({}),
  ...receipt,
}).strict();
export const emailDraftTargetSchema = target.extend({ campaignId: z.string().uuid() }).strict();
type Identity = { userId: string; scopes: string[] };
async function authorize(env: Env, identity: Identity, organizationId: string, write = false) {
  if (!identity.scopes.includes('org:portal.read') || (write && !identity.scopes.includes('org:portal.write')))
    throw new EventIntegrationError(403, 'Missing portal scope');
  await requireEmailOrganizer(env, { id: identity.userId }, organizationId);
}
export async function readEmailWorkspace(env: Env, identity: Identity, input: unknown) {
  const { organizationId } = target.parse(input);
  await authorize(env, identity, organizationId);
  const sender = await senderFor(env, identity.userId);
  const group = await env.DB.prepare('SELECT name,slug FROM organizations WHERE id=?').bind(organizationId).first();
  const counts = await env.DB.prepare(`SELECT count(*) subscribed,sum(user_id='') email_only FROM email_subscriptions s
    WHERE topic_type='organization' AND topic_id=? AND status='subscribed'
    AND NOT EXISTS(SELECT 1 FROM email_contact_suppressions x WHERE x.organization_id=? AND x.email=s.email)
    AND NOT EXISTS(SELECT 1 FROM email_bounces x WHERE x.organization_id=? AND x.email=s.email)`)
    .bind(organizationId, organizationId, organizationId).first();
  return { organizationId, group, ownerUserId: identity.userId, sender: sender ? {
    accountEmail: sender.email, fromEmail: emailFromAddress(env, sender.email), status: sender.status,
  } : null, counts };
}
export async function addEmailSubscriber(env: Env, identity: Identity, input: unknown) {
  const args = emailSubscriberSchema.parse(input);
  await authorize(env, identity, args.organizationId, true);
  const existing = await env.DB.prepare(`SELECT id,status FROM email_subscriptions WHERE topic_type='organization' AND topic_id=? AND email=?`)
    .bind(args.organizationId, args.email).first<{ id: string; status: string }>();
  const blocked = await env.DB.prepare(`SELECT 1 FROM email_contact_suppressions WHERE organization_id=? AND email=?
    UNION ALL SELECT 1 FROM email_bounces WHERE organization_id=? AND email=? LIMIT 1`)
    .bind(args.organizationId, args.email, args.organizationId, args.email).first();
  if (blocked || existing?.status === 'unsubscribed') emailFail(409, 'This address has opted out or is suppressed. Its preference was preserved.');
  const { confirm, previewId, ...changes } = args;
  const owner = { userId: identity.userId, organizationId: args.organizationId, eventId: 'email:subscriber' };
  const fingerprint = await previewFingerprint({ changes, existing });
  if (!confirm) return { ...changes, alreadySubscribed: Boolean(existing), createsAccount: false, sendsEmail: false,
    ...await prepareEventOperation(env.DB, owner, fingerprint) };
  if (!previewId) emailFail(409, 'Preview this subscriber addition first.');
  await claimEventOperation(env.DB, owner, previewId, fingerprint);
  try {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO email_subscriptions
        (id,user_id,email,name,topic_type,topic_id,status,consent_source,updated_at,consented_at,unsubscribed_at)
        SELECT ?,'',?,?,'organization',?,'subscribed',?,?,?,NULL
        WHERE NOT EXISTS(SELECT 1 FROM email_contact_suppressions WHERE organization_id=? AND email=?)
        AND NOT EXISTS(SELECT 1 FROM email_bounces WHERE organization_id=? AND email=?)
        ON CONFLICT(email,topic_type,topic_id) DO NOTHING`)
        .bind(previewId, args.email, args.name, args.organizationId, `organizer:${args.source}`, now, now,
          args.organizationId, args.email, args.organizationId, args.email),
      emailAudit(env, identity.userId, args.organizationId, 'subscription.organizer-added', previewId, existing ? 0 : 1),
    ]);
    await finishEventOperation(env.DB, previewId, true, ['subscriber']);
    const saved = await env.DB.prepare(`SELECT id,status FROM email_subscriptions WHERE topic_type='organization' AND topic_id=? AND email=?`)
      .bind(args.organizationId, args.email).first();
    return { organizationId: args.organizationId, email: args.email, subscription: saved, sent: false, createdAccount: false };
  } catch (error) { await finishEventOperation(env.DB, previewId, false, []); throw error; }
}
async function draftPlan(env: Env, identity: Identity, args: z.infer<typeof emailDraftSchema>) {
  await authorize(env, identity, args.organizationId, true);
  const sender = await senderFor(env, identity.userId);
  if (!sender || sender.status !== 'connected') emailFail(409, 'Connect this account’s email sender first.');
  const group = await env.DB.prepare('SELECT id,name,slug FROM organizations WHERE id=?').bind(args.organizationId)
    .first<{ id: string; name: string; slug: string }>();
  if (!group) emailFail(404, 'Group not found.');
  const event = args.eventId ? await env.DB.prepare(`SELECT e.*,o.name organization_name FROM events e
    JOIN organizations o ON o.id=e.host_org_id WHERE e.id=? AND e.host_org_id=?`)
    .bind(args.eventId, args.organizationId).first<EmailEvent>() : null;
  if (args.eventId && !event) emailFail(404, 'Event not found in this group.');
  const recipients = await env.DB.prepare(`SELECT id,email,name FROM email_subscriptions s
    WHERE topic_type='organization' AND topic_id=? AND status='subscribed' AND (?='organization' OR user_id='')
    AND NOT EXISTS(SELECT 1 FROM email_contact_suppressions x WHERE x.organization_id=? AND x.email=s.email)
    AND NOT EXISTS(SELECT 1 FROM email_bounces x WHERE x.organization_id=? AND x.email=s.email)
    ORDER BY id LIMIT 1001`).bind(args.organizationId, args.audience, args.organizationId, args.organizationId)
    .all<{ id: string; email: string; name: string }>();
  if ((recipients.results?.length || 0) > 1000) emailFail(400, 'Select an audience of 1,000 or fewer subscribers.');
  return { senderEmail: sender.email, fromEmail: emailFromAddress(env, sender.email), event: event || {
    id: '', title: group.name, slug: group.slug, host_org_id: group.id, organization_name: group.name,
    starts_at: null, location: null, image_url: null,
  }, recipients: recipients.results || [] };
}
export async function saveEmailDraft(env: Env, identity: Identity, input: unknown) {
  const args = emailDraftSchema.parse(input);
  const plan = await draftPlan(env, identity, args);
  const { confirm, previewId, ...changes } = args;
  const fingerprint = await previewFingerprint({ changes, plan });
  const owner = { userId: identity.userId, organizationId: args.organizationId, eventId: 'email:draft' };
  if (!confirm) return { ...changes, senderEmail: plan.senderEmail, fromEmail: plan.fromEmail,
    ownerUserId: identity.userId, recipients: plan.recipients.length, status: 'draft', sendsEmail: false,
    ...await prepareEventOperation(env.DB, owner, fingerprint) };
  if (!previewId) emailFail(409, 'Preview this email draft first.');
  await claimEventOperation(env.DB, owner, previewId, fingerprint);
  try {
    const now = Date.now();
    const campaign: EmailCampaign = { id: previewId, owner_user_id: identity.userId, sender_email: plan.senderEmail,
      organization_id: args.organizationId, event_id: plan.event.id, event_json: JSON.stringify(plan.event),
      audience: args.audience === 'email-only' ? 'selected' : 'organization', subject: args.subject, body: args.body,
      content_json: JSON.stringify(args.content), status: 'draft', scheduled_at: now, created_at: now };
    renderCampaign(env, campaign, 'there', null);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO email_campaigns(id,owner_user_id,sender_email,organization_id,event_id,event_json,
        audience,subject,body,content_json,status,scheduled_at,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'draft',?,?,?)`).bind(campaign.id, identity.userId, plan.senderEmail,
          args.organizationId, campaign.event_id, campaign.event_json, campaign.audience, args.subject, args.body,
          campaign.content_json, now, now, now + 90 * 86400000),
      env.DB.prepare(`INSERT INTO email_deliveries(id,campaign_id,sender_user_id,subscription_id,email,name,kind,status)
        SELECT lower(hex(randomblob(16))),?,?,s.id,s.email,s.name,'campaign','draft' FROM email_subscriptions s
        WHERE s.topic_type='organization' AND s.topic_id=? AND s.status='subscribed'
        AND s.id IN (SELECT value FROM json_each(?))
        AND NOT EXISTS(SELECT 1 FROM email_contact_suppressions x WHERE x.organization_id=? AND x.email=s.email)
        AND NOT EXISTS(SELECT 1 FROM email_bounces x WHERE x.organization_id=? AND x.email=s.email)`)
        .bind(campaign.id, identity.userId, args.organizationId, JSON.stringify(plan.recipients.map(r => r.id)),
          args.organizationId, args.organizationId),
      emailAudit(env, identity.userId, args.organizationId, 'campaign.created', campaign.id, plan.recipients.length),
    ]);
    await finishEventOperation(env.DB, previewId, true, ['draft']);
    return readEmailDraft(env, identity, { organizationId: args.organizationId, campaignId: campaign.id });
  } catch (error) { await finishEventOperation(env.DB, previewId, false, []); throw error; }
}
export async function readEmailDraft(env: Env, identity: Identity, input: unknown) {
  const args = emailDraftTargetSchema.parse(input);
  await authorize(env, identity, args.organizationId);
  const campaign = await env.DB.prepare(`SELECT * FROM email_campaigns WHERE id=? AND organization_id=?
    AND owner_user_id=? AND status='draft' AND (expires_at IS NULL OR expires_at>?)`)
    .bind(args.campaignId, args.organizationId, identity.userId, Date.now()).first<EmailCampaign>();
  if (!campaign) emailFail(404, 'Draft not found for this account and group.');
  const counts = await env.DB.prepare("SELECT count(*) recipients FROM email_deliveries WHERE campaign_id=? AND kind='campaign'")
    .bind(campaign.id).first();
  return { organizationId: args.organizationId, campaignId: campaign.id, ownerUserId: campaign.owner_user_id,
    senderEmail: campaign.sender_email, fromEmail: emailFromAddress(env, campaign.sender_email),
    subject: campaign.subject, body: campaign.body, content: JSON.parse(campaign.content_json || '{}'),
    status: campaign.status, counts, sent: false,
    url: `${new URL('/email', emailPortalBase(env)).origin}/email?organization_id=${encodeURIComponent(args.organizationId)}&campaign_id=${campaign.id}` };
}
