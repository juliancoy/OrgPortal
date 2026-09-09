import { HTTPException } from 'hono/http-exception';

export type EmailActor = { id: string; email?: string | null; full_name?: string | null };
export type EmailSubscription = { id: string; user_id: string; email: string; name: string; topic_type: string; topic_id: string; status: string };
export type EmailEvent = { id: string; title: string; slug: string; starts_at: string | null; location: string | null; image_url: string | null; host_org_id: string | null; organization_name: string | null };
export type EmailCampaign = { id: string; owner_user_id: string; sender_email: string; organization_id: string; event_id: string; event_json: string; audience: string; subject: string; body: string; status: string; scheduled_at: number; created_at: number };

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

export function subscriptionStatement(db: D1Database, user: EmailActor, type: 'event' | 'organization', topicId: string, subscribed: boolean) {
  const email = normalizeEmail(user.email);
  if (!email) emailFail(400, 'An email address on your account is required for email updates.');
  return db.prepare(`INSERT INTO email_subscriptions (id, user_id, email, name, topic_type, topic_id, status, consent_source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'registration-form', ?)
    ON CONFLICT(email, topic_type, topic_id) DO UPDATE SET user_id = excluded.user_id, name = excluded.name,
      status = excluded.status, consent_source = excluded.consent_source, updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), user.id, email, user.full_name || 'Member', type, topicId, subscribed ? 'subscribed' : 'unsubscribed', Date.now());
}
