import { createRemoteJWKSet, jwtVerify } from 'jose';
import { base64Url, decryptSecret, digest, emailFail, encryptSecret, googleConfig, normalizeEmail, randomToken, type EmailActor } from './emailShared';

const gmailScope = 'https://www.googleapis.com/auth/gmail.send';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export type Sender = { owner_user_id: string; email: string; refresh_token_ciphertext: string; status: string; cooldown_until: number };

export async function senderFor(env: Env, userId: string) {
  return env.DB.prepare('SELECT * FROM email_senders WHERE owner_user_id = ?').bind(userId).first<Sender>();
}
export async function startGoogleConnection(env: Env, user: EmailActor) {
  const config = googleConfig(env);
  const email = normalizeEmail(user.email);
  const allowed = (env.EMAIL_ALLOWED_SENDERS || '').split(',').map(normalizeEmail).filter(Boolean);
  if (!email || !allowed.includes(email)) emailFail(403, 'This account is not an approved email sender.');
  const state = randomToken();
  const browser = randomToken();
  const verifier = randomToken();
  const nonce = randomToken();
  await env.DB.prepare('DELETE FROM email_oauth_states WHERE expires_at < ?').bind(Date.now()).run();
  await env.DB.prepare(`INSERT INTO email_oauth_states
    (state_hash, owner_user_id, expected_email, browser_hash, verifier_ciphertext, nonce, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(await digest(state), user.id, email, await digest(browser), await encryptSecret(env, verifier, `oauth:${user.id}`), nonce, Date.now() + 600_000).run();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
    scope: `openid email ${gmailScope}`, state, nonce, access_type: 'offline', prompt: 'consent', login_hint: email,
    code_challenge: await digest(verifier), code_challenge_method: 'S256' }).toString();
  return { url: url.toString(), browser };
}
export async function finishGoogleConnection(env: Env, state: string, browser: string, code: string) {
  const config = googleConfig(env);
  if (!state || !browser || !code || state.length > 200 || browser.length > 200 || code.length > 4000) emailFail(400, 'Google connection expired. Please connect again.');
  // An incorrect browser cookie cannot consume somebody else's state.
  const pending = await env.DB.prepare(`DELETE FROM email_oauth_states
    WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING *`)
    .bind(await digest(state), await digest(browser), Date.now()).first<{
      owner_user_id: string; expected_email: string; verifier_ciphertext: string; nonce: string;
    }>();
  if (!pending) emailFail(400, 'Google connection expired. Please connect again.');
  let response: Response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: config.redirectUri, code_verifier: await decryptSecret(env, pending.verifier_ciphertext, `oauth:${pending.owner_user_id}`) }) });
  } catch { emailFail(503, 'Google connection could not be completed. Please connect again.'); }
  if (!response.ok) emailFail(400, 'Google connection could not be completed. Please connect again.');
  const tokens = await response.json() as { id_token?: string; refresh_token?: string; scope?: string };
  if (!tokens.id_token || !tokens.scope?.split(' ').includes(gmailScope)) emailFail(400, 'Please grant permission to send email and reconnect.');
  let email: string;
  try {
    const { payload } = await jwtVerify(tokens.id_token, googleKeys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.clientId,
      algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'email', 'email_verified'] });
    if (payload.nonce !== pending.nonce || payload.email_verified !== true) throw new Error('Invalid identity');
    email = normalizeEmail(payload.email);
  } catch { emailFail(400, 'Google identity could not be verified. Please connect again.'); }
  if (email !== pending.expected_email || !(env.EMAIL_ALLOWED_SENDERS || '').split(',').map(normalizeEmail).includes(email)) emailFail(403, 'Connect the approved Google account shown on the connection screen.');
  const previous = await senderFor(env, pending.owner_user_id);
  const encrypted = tokens.refresh_token ? await encryptSecret(env, tokens.refresh_token, `sender:${pending.owner_user_id}:${email}`)
    : previous?.email === email ? previous.refresh_token_ciphertext : null;
  if (!encrypted) emailFail(400, 'Google did not provide background sending access. Please reconnect with consent.');
  await env.DB.prepare(`INSERT INTO email_senders (owner_user_id, email, refresh_token_ciphertext, connected_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(owner_user_id) DO UPDATE SET email = excluded.email,
      refresh_token_ciphertext = excluded.refresh_token_ciphertext, status = 'connected', connected_at = excluded.connected_at, cooldown_until = 0`)
    .bind(pending.owner_user_id, email, encrypted, Date.now()).run();
}
export async function googleAccessToken(env: Env, sender: Sender): Promise<string | null> {
  const config = googleConfig(env);
  let response: Response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId, client_secret: config.clientSecret,
        refresh_token: await decryptSecret(env, sender.refresh_token_ciphertext, `sender:${sender.owner_user_id}:${sender.email}`) }) });
  } catch { return null; }
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) await env.DB.prepare("UPDATE email_senders SET status = 'reconnect' WHERE owner_user_id = ? AND refresh_token_ciphertext = ?")
      .bind(sender.owner_user_id, sender.refresh_token_ciphertext).run();
    return null;
  }
  const tokens = await response.json() as { access_token?: string };
  return tokens.access_token || null;
}

export async function sendGmail(accessToken: string, raw: string): Promise<{ status: 'sent' | 'failed' | 'uncertain' | 'retry'; id?: string; error?: string; reconnect?: boolean }> {
  let response: Response;
  try {
    response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: base64Url(new TextEncoder().encode(raw)) }), redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
  } catch { return { status: 'uncertain', error: 'No definitive Gmail response. Check Sent mail before sending again.' }; }
  if (response.ok) {
    const body = await response.json().catch(() => null) as { id?: string } | null;
    return body?.id ? { status: 'sent', id: body.id } : { status: 'uncertain', error: 'Gmail accepted the request without a message ID. Check Sent mail.' };
  }
  if (response.status === 429) return { status: 'retry', error: 'Google sending limit reached. Sending has been deferred.' };
  if (response.status === 401) return { status: 'failed', error: 'Google authorization expired. Reconnect the sender.', reconnect: true };
  if (response.status === 403) {
    const body = await response.json().catch(() => null) as { error?: { errors?: { reason?: string }[] } } | null;
    if (body?.error?.errors?.some((error) => ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded'].includes(error.reason || '')))
      return { status: 'retry', error: 'Google sending limit reached. Sending has been deferred.' };
  }
  return response.status >= 500
    ? { status: 'uncertain', error: 'Google returned a server error. Check Sent mail before sending again.' }
    : { status: 'failed', error: 'Google rejected this message. Check the sender connection and message details.' };
}
