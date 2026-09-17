import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';

function secureUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Expected a public HTTPS service URL');
  return url;
}

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Request failed (${response.status}); check service deployment and account permissions`);
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

export async function browserLogin(resource, issuer, clientId, openBrowser = true) {
  secureUrl(resource); secureUrl(issuer);
  const metadata = await json(`${issuer}/.well-known/oauth-authorization-server`);
  if (metadata.issuer !== issuer || !metadata.code_challenge_methods_supported?.includes('S256')
      || !metadata.token_endpoint_auth_methods_supported?.includes('none')
      || !metadata.authorization_response_iss_parameter_supported) throw new Error('Service does not support native account authorization yet');
  for (const key of ['authorization_endpoint', 'token_endpoint', 'revocation_endpoint']) {
    if (secureUrl(metadata[key]).origin !== new URL(issuer).origin) throw new Error('Unexpected authorization endpoint');
  }
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
    let token = await json(metadata.token_endpoint, { method: 'POST', body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirect, resource, code_verifier: verifier }) });
    if (!token.access_token || !token.refresh_token) throw new Error('Incomplete token response');
    let expiresAt = Date.now() + token.expires_in * 1000;
    return {
      async accessToken() {
        if (Date.now() > expiresAt - 30000) {
          // Calls are sequential; never retry an ambiguous rotating-refresh exchange.
          token = await json(metadata.token_endpoint, { method: 'POST', body: new URLSearchParams({
            grant_type: 'refresh_token', client_id: clientId, refresh_token: token.refresh_token, resource }) });
          if (!token.access_token || !token.refresh_token) throw new Error('Incomplete refresh response');
          expiresAt = Date.now() + token.expires_in * 1000;
        }
        return token.access_token;
      },
      async close() {
        const response = await fetch(metadata.revocation_endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          body: new URLSearchParams({ client_id: clientId, token: token.refresh_token }) });
        if (!response.ok) throw new Error('Revoke the connection from your PIdP account');
        token = null;
      },
    };
  } finally { clearTimeout(timer); server.closeAllConnections(); server.close(); }
}

async function main() {
  const { values } = parseArgs({ options: { resource: { type: 'string' }, issuer: { type: 'string', default: 'https://id.codecollective.us' },
    'client-id': { type: 'string', default: 'orgportal-local-upload' }, organization: { type: 'string' }, event: { type: 'string' },
    directory: { type: 'string' }, yes: { type: 'boolean' }, 'no-browser': { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) { console.log('event-upload.mjs --resource https://HOST/api/org/mcp --organization ORG_ID --event SLUG --directory PATH [--yes] [--no-browser]'); return; }
  if (!values.resource || !values.organization || !values.event || !values.directory) throw new Error('Specify --resource, --organization, --event and --directory (see --help)');
  const resource = secureUrl(values.resource).toString();
  const extensions = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  const files = (await readdir(values.directory)).filter(name => extensions[extname(name).toLowerCase()]).sort();
  if (!files.length || files.length > 12) throw new Error('Choose a directory with 1 to 12 supported images');
  for (const name of files) {
    const info = await stat(resolve(values.directory, name));
    if (!info.isFile() || !info.size || info.size > 8 * 1024 * 1024) throw new Error(`${name}: expected an image up to 8 MB`);
  }
  const connection = await browserLogin(resource, values.issuer, values['client-id'], !values['no-browser']);
  try {
    for (const name of files) {
      const data = await readFile(resolve(values.directory, name));
      const form = new FormData();
      form.set('organizationId', values.organization); form.set('eventId', values.event);
      form.set('label', basename(name)); form.set('image', new Blob([data], { type: extensions[extname(name).toLowerCase()] }), name);
      const send = async () => json(`${resource}/uploads/event-media`, { method: 'POST', headers: { authorization: `Bearer ${await connection.accessToken()}` }, body: form });
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
      const result = await send();
      if (!result.success) throw new Error(`Upload outcome uncertain; inspect operation ${preview.previewId} before retrying`);
      console.log(`Attached ${name} to ${preview.eventTitle}`);
    }
  } finally { await connection.close().catch(() => console.error('Connection cleanup failed; revoke it at the PIdP connected-apps page.')); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
