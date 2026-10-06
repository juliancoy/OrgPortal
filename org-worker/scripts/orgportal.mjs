#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { browserLogin } from './event-upload.mjs';
import { credentialStore } from './upload-connection.mjs';

const help = `Usage:
  orgportal auth login [--portal https://lifetech.fyi] [--connection NAME] [--no-browser]
  orgportal auth logout [--portal https://lifetech.fyi] [--connection NAME]

Options: --resource HTTPS_MCP_URL, --issuer HTTPS_PIDP_ORIGIN, --client-id ID
Defaults: ORGPORTAL_PORTAL or https://lifetech.fyi;
          ORGPORTAL_ISSUER or https://id.codecollective.us;
          ORGPORTAL_CONNECTION or default.
Login uses browser consent and the OS keyring. Logout revokes the saved grant.
Account permissions and preview/apply requirements still govern remote updates.`;

export function parseCommand(args, env = process.env) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    portal: { type: 'string' }, resource: { type: 'string' }, issuer: { type: 'string' },
    connection: { type: 'string' }, 'client-id': { type: 'string' },
    'no-browser': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help || !args.length) return { help: true };
  if (positionals.length !== 2 || positionals[0] !== 'auth' || !['login', 'logout'].includes(positionals[1])) {
    throw new Error('Use orgportal auth login or orgportal auth logout (see --help).');
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
  const connection = values.connection || env.ORGPORTAL_CONNECTION || 'default';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(connection)) throw new Error('Invalid connection name.');
  return { action: positionals[1], resource: resource.href, issuer: issuer.origin,
    connection, clientId: values['client-id'], openBrowser: !values['no-browser'] };
}

export async function run(args, dependencies = {}) {
  const command = parseCommand(args, dependencies.env || process.env);
  const log = dependencies.log || console.log;
  if (command.help) { log(help); return; }
  const store = await (dependencies.credentialStore || credentialStore)(command.resource, command.issuer, command.connection);
  let account;
  try {
    // Logging out an absent connection needs neither a browser nor a network call.
    if (command.action === 'logout' && !(await store.load())?.refreshToken) {
      log(`Already logged out (${command.connection}).`); return;
    }
    account = await (dependencies.browserLogin || browserLogin)(command.resource, command.issuer,
      command.clientId, command.openBrowser, { store, disconnect: command.action === 'logout',
        clientName: 'OrgPortal CLI', scope: 'org:events.read org:events.write org:portal.read org:portal.write' });
    if (command.action === 'logout') {
      await account.disconnect();
      log(`Logged out (${command.connection}); account grant revoked.`);
    } else {
      await account.accessToken();
      log(`Logged in to ${command.resource} (${command.connection}). Credentials saved in the OS keyring.`);
    }
  } finally {
    try { await account?.close(); } finally { await store.release(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
