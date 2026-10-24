import { HTTPException } from 'hono/http-exception';

export type EmailActor = { id: string; email?: string | null; full_name?: string | null };
export type EmailSubscription = { id: string; user_id: string; email: string; name: string; topic_type: string; topic_id: string; status: string; consent_source: string; consented_at: number | null; unsubscribed_at: number | null; updated_at: number };
export type EmailEvent = { id: string; title: string; slug: string; starts_at: string | null; location: string | null; image_url: string | null; host_org_id: string | null; organization_name: string | null };
export type EmailCampaign = { id: string; owner_user_id: string; sender_email: string; organization_id: string; event_id: string; event_json: string; audience: string; subject: string; body: string; status: string; scheduled_at: number; created_at: number; audience_mode?: string; batch_size?: number; batch_limit?: number; content_json?: string | null; report_only?: number; expires_at?: number | null };

export function emailFail(status: 400 | 401 | 403 | 404 | 409 | 429 | 503, message: string): never {
  throw new HTTPException(status, { res: Response.json({ detail: message }, { status }) });
}
export function normalizeEmail(value: unknown): string {
  const result = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(result) && result.length <= 254 ? result : '';
}
export function base64Url(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBase64(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
}
export function randomToken() { return base64Url(crypto.getRandomValues(new Uint8Array(32))); }
export async function digest(value: string) { return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
function encryptionBytes(env: Env) {
  try {
    const key = decodeBase64(env.EMAIL_TOKEN_ENCRYPTION_KEY || '');
    if (key.length === 32) return key;
  } catch { /* handled below */ }
  emailFail(503, 'Email sender encryption is not configured.');
}
export async function encryptSecret(env: Env, text: string, context: string) {
  const key = await crypto.subtle.importKey('raw', encryptionBytes(env), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, new TextEncoder().encode(text));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(data))}`;
}
export async function decryptSecret(env: Env, value: string, context: string) {
  const [iv, data] = value.split('.');
  const key = await crypto.subtle.importKey('raw', encryptionBytes(env), 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64(iv), additionalData: new TextEncoder().encode(context) }, key, decodeBase64(data)));
}
export function googleConfig(env: Env) {
  if (!env.EMAIL_GOOGLE_CLIENT_ID || !env.EMAIL_GOOGLE_CLIENT_SECRET || !env.EMAIL_GOOGLE_REDIRECT_URI) emailFail(503, 'Google email connection needs administrator setup.');
  let redirect: URL;
  try { redirect = new URL(env.EMAIL_GOOGLE_REDIRECT_URI); } catch { emailFail(503, 'Email callback URL is not configured.'); }
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.search || redirect.hash || !redirect.pathname.endsWith('/api/email/google/callback')) emailFail(503, 'Email callback URL is not configured.');
  encryptionBytes(env);
  return { clientId: env.EMAIL_GOOGLE_CLIENT_ID, clientSecret: env.EMAIL_GOOGLE_CLIENT_SECRET, redirectUri: redirect.toString() };
}
export function emailPortalBase(env: Env) {
  let url: URL;
  try { url = new URL(env.PUBLIC_PORTAL_BASE_URL || ''); } catch { emailFail(503, 'Public portal URL is not configured.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) emailFail(503, 'Public portal URL is not configured.');
  return url.toString().replace(/\/+$/, '');
}
export function emailSetupIssues(env: Env): string[] {
  const issues: string[] = [];
  if (!env.EMAIL_GOOGLE_CLIENT_ID?.trim()) issues.push('Google OAuth client ID');
  if (!env.EMAIL_GOOGLE_CLIENT_SECRET?.trim()) issues.push('Google OAuth client secret');
  let callback: URL | undefined;
  try {
    callback = new URL(env.EMAIL_GOOGLE_REDIRECT_URI || '');
    if (callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash || !callback.pathname.endsWith('/api/email/google/callback')) throw new Error();
  } catch { issues.push('Valid Google OAuth callback URL'); callback = undefined; }
  try { encryptionBytes(env); } catch { issues.push('Sender token encryption key'); }
  if (!env.EMAIL_UNSUBSCRIBE_SECRET || env.EMAIL_UNSUBSCRIBE_SECRET.length < 32) issues.push('Unsubscribe signing secret');
  try { if(decodeBase64(env.EMAIL_CONTACT_UNSUBSCRIBE_KEY || '').length!==32)throw new Error(); } catch { issues.push('Contact unsubscribe encryption key'); }
  try {
    const portal = new URL(emailPortalBase(env));
    if (callback && portal.origin !== callback.origin) issues.push('Matching portal and Google callback hosts');
  } catch { issues.push('Public portal URL'); }
  if (!(env.EMAIL_ALLOWED_SENDERS || '').split(',').some(value => normalizeEmail(value))) issues.push('Approved sender email');
  return issues;
}

export function emailDailyLimit(env: Env) {
  const value = Number(env.EMAIL_DAILY_LIMIT || 250);
  return Number.isFinite(value) ? Math.max(1, Math.min(1500, Math.floor(value))) : 250;
}
async function unsubscribeKey(env: Env) {
  if (!env.EMAIL_UNSUBSCRIBE_SECRET || env.EMAIL_UNSUBSCRIBE_SECRET.length < 32) emailFail(503, 'Email unsubscribe signing is not configured.');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.EMAIL_UNSUBSCRIBE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function unsubscribeUrl(env: Env, subscriptionId: string) {
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await unsubscribeKey(env), new TextEncoder().encode(subscriptionId))));
  const url = new URL(googleConfig(env).redirectUri.replace(/\/google\/callback$/, '/unsubscribe'));
  url.searchParams.set('token', `${subscriptionId}.${signature}`);
  return url.toString();
}
export async function verifyUnsubscribe(env: Env, token: string) {
  const [id, signature, extra] = token.split('.');
  if (!id || !signature || extra || token.length > 200) emailFail(400, 'Invalid unsubscribe link.');
  let valid = false;
  try { valid = await crypto.subtle.verify('HMAC', await unsubscribeKey(env), decodeBase64(signature), new TextEncoder().encode(id)); } catch { /* invalid token */ }
  if (!valid) emailFail(400, 'Invalid unsubscribe link.');
  return id;
}

export function subscriptionStatement(db: D1Database, user: EmailActor, type: 'event' | 'organization', topicId: string, subscribed: boolean, source = 'registration-form') {
  const email = normalizeEmail(user.email);
  if (!email) emailFail(400, 'An email address on your account is required for email updates.');
  const now = Date.now();
  return db.prepare(`INSERT INTO email_subscriptions (id,user_id,email,name,topic_type,topic_id,status,consent_source,updated_at,consented_at,unsubscribed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(email,topic_type,topic_id) DO UPDATE SET
      name=excluded.name,status=excluded.status,consent_source=excluded.consent_source,updated_at=excluded.updated_at,
      consented_at=CASE WHEN excluded.status='subscribed' THEN excluded.consented_at ELSE email_subscriptions.consented_at END,
      unsubscribed_at=excluded.unsubscribed_at
    WHERE email_subscriptions.user_id=excluded.user_id`)
    .bind(crypto.randomUUID(),user.id,email,user.full_name || 'Member',type,topicId,
      subscribed ? 'subscribed' : 'unsubscribed',source,now,subscribed ? now : null,subscribed ? null : now);
}

// Operator-configured Gmail send-as aliases; Google account ownership stays unchanged.
export function emailFromAddress(env: Env, accountEmail: string): string {
  if (!env.EMAIL_SENDER_ALIASES) return accountEmail;
  let aliases: Record<string, unknown>;
  try {
    aliases = JSON.parse(env.EMAIL_SENDER_ALIASES);
    if (!aliases || Array.isArray(aliases) || typeof aliases !== 'object') throw new Error();
  } catch { emailFail(503, 'Email sender aliases need configuration.'); }
  const alias = aliases[normalizeEmail(accountEmail)];
  if (alias === undefined) return accountEmail;
  if (typeof alias !== 'string' || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(alias)) emailFail(503, 'Email sender alias is invalid.');
  return normalizeEmail(alias);
}


export async function hasSuccessfulSelfTest(env: Env, campaign: EmailCampaign): Promise<boolean> {
  return Boolean(await env.DB.prepare(`SELECT id FROM email_deliveries WHERE campaign_id = ?
    AND sender_user_id = ? AND email = ? AND kind = 'test' AND status = 'sent' LIMIT 1`)
    .bind(campaign.id, campaign.owner_user_id, campaign.sender_email).first());
}
