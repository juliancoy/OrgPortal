#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { browserLogin } from './event-upload.mjs';
import { credentialStore } from './upload-connection.mjs';
import { syncNewsletterDatabase } from './newsletter-sync.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

const help = `Usage:
  orgportal auth login [--admin] [--portal https://lifetech.fyi] [--connection NAME] [--browser]
  orgportal auth logout [--portal https://lifetech.fyi] [--connection NAME]
  orgportal profile get|preview|apply|status --organization ID [--file PATCH_JSON] [--preview-id UUID]
  orgportal sync [--portal https://lifetech.fyi] [--connection NAME] [--dry-run]
  orgportal journal sync [--file SQLITE_PATH] (requires Cloudflare operator login)

Options: --resource HTTPS_MCP_URL, --issuer HTTPS_PIDP_ORIGIN, --client-id ID
Sync options: --dry-run, --local LOOPBACK_HTTPS_ORIGIN, --deployment CONFIG_JSON, --cert CA_FILE
Defaults: ORGPORTAL_PORTAL or https://lifetech.fyi;
          ORGPORTAL_ISSUER or https://id.codecollective.us;
          ORGPORTAL_CONNECTION or default.
Login prints a pasteable link; --browser explicitly opens your default browser.
Login uses browser consent and the OS keyring. Logout revokes the saved grant.
Account permissions and preview/apply requirements still govern remote updates.`;

export function parseCommand(args, env = process.env) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    portal: { type: 'string' }, resource: { type: 'string' }, issuer: { type: 'string' },
    connection: { type: 'string' }, 'client-id': { type: 'string' },
    admin: { type: 'boolean' }, browser: { type: 'boolean' }, 'no-browser': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    'dry-run': { type: 'boolean' }, local: { type: 'string' }, deployment: { type: 'string' }, cert: { type: 'string' },
    file: { type: 'string' }, organization: { type: 'string' }, 'preview-id': { type: 'string' },
  } });
  if (values.help || !args.length) return { help: true };
  if (positionals.length === 2 && positionals[0] === 'journal' && positionals[1] === 'sync') {
    if (Object.keys(values).some(key => key !== 'file')) throw Error('Journal sync accepts only --file and uses Cloudflare operator credentials.');
    return { action: 'journal', file: resolve(values.file || root + '/.local/journal/change-journal.sqlite') };
  }
  const profile = positionals.length === 2 && positionals[0] === 'profile' && ['get','preview','apply','status'].includes(positionals[1]);
  if (profile && (!values.organization || (['preview','apply'].includes(positionals[1]) && !values.file) || (['apply','status'].includes(positionals[1]) && !values['preview-id']))) throw Error('Profile commands require --organization; preview/apply require --file; apply/status require --preview-id.');
  if (profile && values['dry-run']) throw Error('Use profile preview instead of --dry-run.');
  const sync = positionals.length === 1 && positionals[0] === 'sync';
  if (!profile && !sync && (positionals.length !== 2 || positionals[0] !== 'auth' || !['login', 'logout'].includes(positionals[1]))) {
    throw new Error('Use orgportal auth login, orgportal auth logout, or orgportal sync (see --help).');
  }
  if (values.portal && values.resource) throw new Error('Choose --portal or --resource.');
  const portal = new URL(values.portal || env.ORGPORTAL_PORTAL || 'https://lifetech.fyi');
  const issuer = new URL(values.issuer || env.ORGPORTAL_ISSUER || 'https://id.codecollective.us');
  for (const url of [portal, issuer]) {
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Portal and issuer must be HTTPS origins.');
    }
  }
  const resource = new URL(values.resource || '/api/org/mcp', portal);
  if (resource.protocol !== 'https:' || resource.username || resource.password || resource.search || resource.hash || !resource.pathname.endsWith('/mcp')) {
    throw new Error('Resource must be an HTTPS MCP endpoint.');
  }
  if (values.admin && !(positionals[0] === 'auth' && positionals[1] === 'login')) throw Error('--admin applies only to auth login.');
  if (values.admin && !values.connection) throw Error('Use --admin with an explicit --connection name to keep the website connection separate.');
  const connection = values.connection || env.ORGPORTAL_CONNECTION || 'default';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(connection)) throw new Error('Invalid connection name.');
  return { action: profile ? 'profile' : sync ? 'sync' : positionals[1], profileAction: profile ? positionals[1] : undefined, organizationId: values.organization, previewId: values['preview-id'], profileFile: values.file ? resolve(values.file) : undefined, resource: resource.href, issuer: issuer.origin,
    connection, clientId: values['client-id'], admin: !!values.admin, openBrowser: !!values.browser && !values['no-browser'], dryRun: !!values['dry-run'],
    local: values.local || 'https://localhost:8443', deployment: resolve(values.deployment || root + '/.local/bmoremedtech-newsletter-storage.json'),
    cert: resolve(values.cert || root + '/.local/certs/localhost.crt') };
}

export async function run(args, dependencies = {}) {
  const command = parseCommand(args, dependencies.env || process.env);
  const log = dependencies.log || console.log;
  if (command.help) { log(help); return; }
  if (command.action === 'journal') {
    const mirror = dependencies.mirrorChangeJournal || (await import('./journal-mirror.mjs')).mirrorChangeJournal;
    log(JSON.stringify(await mirror(command.file))); return;
  }
  const store = await (dependencies.credentialStore || credentialStore)(command.resource, command.issuer, command.connection);
  let account;
  try {
    if (['sync','profile'].includes(command.action) && !(await store.load())?.refreshToken) throw Error('Sign in first: orgportal auth login');
    // Logging out an absent connection needs neither a browser nor a network call.
    if (command.action === 'logout' && !(await store.load())?.refreshToken) {
      log(`Already logged out (${command.connection}).`); return;
    }
    account = await (dependencies.browserLogin || browserLogin)(command.resource, command.issuer,
      command.clientId, command.openBrowser, { store, disconnect: command.action === 'logout',
        admin: command.admin, clientName: 'OrgPortal CLI', scope: 'org:events.read org:events.write org:portal.read org:portal.write' });
    if (command.action === 'profile') {
      log(JSON.stringify(await (dependencies.runProfileCommand || runProfileCommand)(command, account), null, 2));
    } else if (command.action === 'sync') {
      await (dependencies.syncNewsletterDatabase || syncNewsletterDatabase)(command, account, root, log);
    } else if (command.action === 'logout') {
      await account.disconnect();
      log(`Logged out (${command.connection}); account grant revoked.`);
    } else {
      const token = await account.accessToken();
      if (command.admin) {
        const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        if (!claims.sub?.startsWith('owner:') || !['org:portal.read','org:portal.write'].every(scope => claims.scope?.split(' ').includes(scope))) throw Error('This saved connection is not a primary account with portal scopes. Use a fresh named admin connection and approve consent.');
      }
      log(`Logged in to ${command.resource} (${command.connection}). Credentials saved in the OS keyring.`);
    }
  } finally {
    try { await account?.close(); } finally { await store.release(); }
  }
}

export async function runProfileCommand(command, account) {
  const toolNames = {get:'get_organization_profile',preview:'preview_organization_profile',apply:'apply_organization_profile',status:'get_organization_profile_operation'};
  let patch = {};
  if (['preview','apply'].includes(command.profileAction)) {
    patch = JSON.parse(await readFile(command.profileFile, 'utf8'));
    const allowed = ['name','description','image_url','city','tags'];
    if (!patch || Array.isArray(patch) || typeof patch !== 'object' || Object.keys(patch).some(key => !allowed.includes(key))) throw Error('Patch file must contain only organization profile fields.');
  }
  const args = { ...patch, organizationId: command.organizationId,
    ...(command.previewId ? { previewId: command.previewId } : {}),
    ...(command.profileAction === 'apply' ? { confirm: true } : {}) };
  const client = new Client({ name: 'OrgPortal CLI', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(command.resource), {
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${await account.accessToken()}`);
      return fetch(url, { ...init, headers, redirect: 'error' });
    },
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolNames[command.profileAction], arguments: args });
    if (result.isError) throw Error(result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') || 'Profile operation failed');
    return result.structuredContent || result;
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
