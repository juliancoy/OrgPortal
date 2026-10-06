#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { browserLogin } from './event-upload.mjs';
import { credentialStore } from './upload-connection.mjs';
const { values } = parseArgs({ options: { connection: { type: 'string' }, file: { type: 'string' }, apply: { type: 'boolean' }, 'no-browser': { type: 'boolean' } } });
let store, connection, client;
try {
  if (!values.file) throw new Error('Use --file data/lifetech-venue-avatars-2026-10-03.json [--apply]');
  const plan = JSON.parse(await readFile(values.file, 'utf8'));
  const resource = new URL(plan.resource);
  if (resource.protocol !== 'https:' || resource.username || resource.password || resource.search || resource.hash) throw new Error('Expected a public HTTPS MCP resource.');
  const issuer = 'https://id.codecollective.us';
  store = await credentialStore(resource.href, issuer, values.connection);
  connection = await browserLogin(resource.href, issuer, undefined, !values['no-browser'], {
    store, scope: 'org:events.read org:events.write', clientName: 'OrgPortal venue images',
  });
  client = new Client({ name: 'orgportal-venue-images', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(resource, { fetch: async (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${await connection.accessToken()}`);
    return fetch(url, { ...init, headers });
  } }));
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(JSON.stringify(result.content));
    return result.structuredContent || JSON.parse(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'));
  };
  const previews = [];
  for (const venue of plan.venues) {
    const { name, ...fields } = venue;
    const args = { organizationId: plan.organizationId, ...fields };
    const preview = await call('preview_venue_image_changes', args);
    if (!preview.previewId || preview.name !== name && preview.name !== name.replace('’', "'")) throw new Error('Unexpected venue or missing preview receipt; no changes applied.');
    console.log(JSON.stringify(preview, null, 2));
    previews.push({ args, preview });
  }
  if (values.apply) {
    if (!process.stdin.isTTY) throw new Error('Run --apply interactively to review the previews.');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    let answer;
    try { answer = await prompt.question('Apply the displayed venue avatar previews? [y/N] '); } finally { prompt.close(); }
    if (answer.trim().toLowerCase() === 'y') {
      for (const { args, preview } of previews) {
        try { console.log(JSON.stringify(await call('apply_venue_image_changes', { ...args, previewId: preview.previewId, confirm: true }), null, 2)); }
        catch { throw new Error(`Inspect venue ${args.venueId} and operation ${preview.previewId} before retrying; apply outcome may be uncertain.`); }
      }
    }
  } else console.log('Preview only. Run with --apply to review and confirm.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await client?.close(); await connection?.close(); await store?.release(); }
