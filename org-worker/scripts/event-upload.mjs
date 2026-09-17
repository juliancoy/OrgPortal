import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { credentialStore, tokenConnection } from './upload-connection.mjs';

function secureUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Expected a public HTTPS service URL');
  return url;
}

async function json(url, { timeoutMs = 30000, ...options } = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    // Only known service errors are safe to display; never echo arbitrary token responses.
    const messages = new Set(['PIdP token status is unavailable', 'Uploads require account revocation checks',
      'Invalid or unauthorized access token', 'Missing event scope', 'Event does not belong to this organization', 'invalid_grant']);
    throw new Error(`Request failed (${response.status})${messages.has(data.error) ? `: ${data.error}` : '; check service deployment and account permissions'}`);
  }
  return response.json();
}

export function callbackResult(url, state, issuer) {
  for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length !== 1) throw new Error('Invalid callback');
  if (url.pathname !== '/callback' || url.searchParams.get('state') !== state || url.searchParams.get('iss') !== issuer) throw new Error('Invalid callback');
  if (url.searchParams.has('error')) throw new Error('Authorization was declined');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Missing authorization code');
  return code;
}

export async function browserLogin(resource, issuer, clientId, openBrowser = true, options = {}) {
  secureUrl(resource); secureUrl(issuer);
  const metadata = await json(`${issuer}/.well-known/oauth-authorization-server`);
  if (metadata.issuer !== issuer || !metadata.code_challenge_methods_supported?.includes('S256')
      || !metadata.token_endpoint_auth_methods_supported?.includes('none')
      || !metadata.authorization_response_iss_parameter_supported) throw new Error('Service does not support native account authorization yet');
  for (const key of ['authorization_endpoint', 'token_endpoint', 'revocation_endpoint']) {
    if (secureUrl(metadata[key]).origin !== new URL(issuer).origin) throw new Error('Unexpected authorization endpoint');
  }
  const saved = options.store ? await options.store.load() : null;
  if (saved && (!saved.clientId || (saved.refreshToken && clientId && saved.clientId !== clientId))) throw new Error('Saved client does not match; disconnect the saved connection first');
  clientId = clientId || saved?.clientId;
  if (options.disconnect && !saved?.refreshToken) return { close: async () => {}, disconnect: async () => {} };
  if (!clientId) {
    if (secureUrl(metadata.registration_endpoint).origin !== new URL(issuer).origin) throw new Error('Unexpected registration endpoint');
    const registration = await json(metadata.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'OrgPortal image upload', token_endpoint_auth_method: 'none',
        redirect_uris: ['http://127.0.0.1/callback'], grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'], scope: 'org:events.read org:events.write' }) });
    if (typeof registration.client_id !== 'string' || !registration.client_id || registration.client_secret) throw new Error('Invalid public client registration');
    clientId = registration.client_id;
  }
  if (options.store && saved?.clientId !== clientId) await options.store.save({ clientId });
  if (saved?.refreshToken) return tokenConnection({ resource, clientId, metadata, store: options.store, saved, requestJson: json });
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  let complete, cancel;
  const codePromise = new Promise((resolve, reject) => { complete = resolve; cancel = reject; });
  // Register rejection handling before opening the browser or awaiting listen.
  codePromise.catch(() => {});
  let redirect;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.method !== 'GET' || request.headers.host !== new URL(redirect).host) {
      response.writeHead(400).end('Invalid callback'); return;
    }
    try {
      const url = new URL(request.url, redirect);
      const code = callbackResult(url, state, issuer);
      response.end('Account connected. You can return to the upload.');
      complete(code);
    } catch (error) {
      response.writeHead(400).end('Authorization was not completed.');
      const url = new URL(request.url, redirect);
      if (url.searchParams.get('state') === state && url.searchParams.get('iss') === issuer) cancel(error);
    }
  });
  const timer = setTimeout(() => cancel(new Error('Browser sign-in timed out')), 10 * 60 * 1000);
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    redirect = `http://127.0.0.1:${server.address().port}/callback`;
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, resource,
      scope: 'org:events.read org:events.write', state, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    console.log(`Sign in and approve access in your browser:\n${url}`);
    if (openBrowser) {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? null : 'xdg-open';
      if (command) { const child = spawn(command, [url.toString()], { stdio: 'ignore' }); child.on('error', () => {}); child.unref(); }
    }
    const code = await codePromise;
    const token = await json(metadata.token_endpoint, { method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirect, resource, code_verifier: verifier }) });
    return tokenConnection({ resource, clientId, metadata, token, store: options.store, requestJson: json });
  } finally { clearTimeout(timer); server.closeAllConnections(); server.close(); }
}

async function main() {
  const { values } = parseArgs({ options: { resource: { type: 'string' }, issuer: { type: 'string', default: 'https://id.codecollective.us' },
    'client-id': { type: 'string' }, organization: { type: 'string' }, event: { type: 'string' },
    connect: { type: 'boolean' }, disconnect: { type: 'boolean' }, ephemeral: { type: 'boolean' },
    directory: { type: 'string' }, yes: { type: 'boolean' }, 'no-browser': { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) { console.log('event-upload.mjs --resource https://HOST/api/org/mcp [--connect | --disconnect | --organization ORG_ID --event SLUG --directory PATH] [--yes] [--no-browser] [--ephemeral]'); return; }
  if ((values.connect && values.disconnect) || (values.ephemeral && (values.connect || values.disconnect))) throw new Error('Choose one connection mode');
  if (!values.resource || (!(values.connect || values.disconnect) && (!values.organization || !values.event || !values.directory))) throw new Error('Specify --resource and a connection command or upload arguments (see --help)');
  const resource = secureUrl(values.resource).toString();
  const extensions = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  const files = values.connect || values.disconnect ? [] : (await readdir(values.directory)).filter(name => extensions[extname(name).toLowerCase()]).sort();
  if (!(values.connect || values.disconnect) && (!files.length || files.length > 12)) throw new Error('Choose a directory with 1 to 12 supported images');
  for (const name of files) {
    const info = await stat(resolve(values.directory, name));
    if (!info.isFile() || !info.size || info.size > 8 * 1024 * 1024) throw new Error(`${name}: expected an image up to 8 MB`);
  }
  const store = values.ephemeral ? null : await credentialStore(resource, values.issuer);
  let connection;
  try {
    connection = await browserLogin(resource, values.issuer, values['client-id'], !values['no-browser'], { store, disconnect: values.disconnect });
    if (values.disconnect) { await connection.disconnect(); console.log('Disconnected.'); return; }
    if (values.connect) { await connection.accessToken(); console.log('Account connection saved in the OS keyring.'); return; }
    for (const name of files) {
      const data = await readFile(resolve(values.directory, name));
      const form = new FormData();
      form.set('organizationId', values.organization); form.set('eventId', values.event);
      form.set('label', basename(name)); form.set('image', new Blob([data], { type: extensions[extname(name).toLowerCase()] }), name);
      const send = async () => json(`${resource}/uploads/event-media`, { method: 'POST', headers: { authorization: `Bearer ${await connection.accessToken()}` }, body: form, timeoutMs: 120000 });
      const preview = await send();
      if (!preview.dryRun || !preview.previewId) throw new Error('Upload preview unavailable');
      console.log(JSON.stringify({ event: preview.eventTitle, organization: preview.organizationId, image: preview.image, existingImages: preview.before.length }, null, 2));
      if (!values.yes) {
        if (!process.stdin.isTTY) throw new Error('Review the preview and rerun with --yes only after user authorization');
        const prompt = createInterface({ input: process.stdin, output: process.stdout });
        try { if ((await prompt.question('Attach this image? [y/N] ')).trim().toLowerCase() !== 'y') break; }
        finally { prompt.close(); }
      }
      form.set('confirm', 'true'); form.set('previewId', preview.previewId);
      let result;
      try { result = await send(); }
      catch { throw new Error(`Upload outcome uncertain; inspect operation ${preview.previewId} and the gallery before retrying ${name}`); }
      if (!result.success) throw new Error(`Upload outcome uncertain; inspect operation ${preview.previewId} before retrying`);
      console.log(`Attached ${name} to ${preview.eventTitle}`);
    }
  } finally {
    await connection?.close().catch(() => console.error('Connection cleanup failed; revoke it at the PIdP connected-apps page.'));
    await store?.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
