#!/usr/bin/env node
// Uses the shared browser-bound account authorization and native preview/apply tools.
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { browserLogin } from './event-upload.mjs';
import { credentialStore } from './upload-connection.mjs';

const { values } = parseArgs({ options: {
  resource: { type: 'string', default: 'https://medtech.social/api/org/mcp' },
  organization: { type: 'string', default: 'org-baltimore-medtech' },
  issuer: { type: 'string', default: 'https://id.codecollective.us' },
  connect: { type: 'boolean' }, apply: { type: 'boolean' }, ephemeral: { type: 'boolean' },
  'no-browser': { type: 'boolean' }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log('event-times.mjs [--connect | --apply] [--ephemeral] [--no-browser] [--resource HTTPS_URL] [--organization ID]\nDefault: preview October 20 and November 17, 2026, 6:00–8:30 PM America/New_York. --apply prompts after previews.');
  process.exit(0);
}
let store, connection, client;
try {
  store = values.ephemeral ? null : await credentialStore(values.resource, values.issuer);
  connection = await browserLogin(values.resource, values.issuer, undefined, !values['no-browser'], {
    store, scope: 'org:events.read org:events.write', clientName: 'OrgPortal event times',
  });
  if (values.connect) {
    await connection.accessToken();
    console.log(values.ephemeral ? 'Connected for this process.' : 'Account connection saved in the OS keyring.');
  } else {
    client = new Client({ name: 'orgportal-event-times', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(values.resource), {
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Bearer ${await connection.accessToken()}`);
        return fetch(url, { ...init, headers });
      },
    }));
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      if (result.isError) throw new Error(JSON.stringify(result.content));
      if (result.structuredContent) return result.structuredContent;
      const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
      return JSON.parse(text);
    };
    const plans = [];
    for (const [date, offset] of [['2026-10-20', '-04:00'], ['2026-11-17', '-05:00']]) {
      const slug = `medtech-in-the-hut-${date}`;
      const response = await fetch(new URL(`./api/network/events/public/${slug}`, values.resource), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Cannot read ${slug} (${response.status})`);
      const before = await response.json();
      if (before.id !== slug || before.host_org_id !== values.organization) throw new Error('Unexpected event or organization; no changes applied.');
      const args = { organizationId: values.organization, event: {
        ingestKey: `portal:${slug}`, title: before.title, slug,
        description: (before.description || '').replace('Event time and venue are not yet confirmed.', 'The event runs from 6:00–8:30 PM Eastern. Venue is not yet confirmed.'),
        startsAt: `${date}T18:00:00${offset}`, endsAt: `${date}T20:30:00${offset}`,
        location: before.location, sourceUrl: before.source_url, imageUrl: before.image_url,
        tags: before.tags || [], city: before.city || 'Baltimore',
        links: (before.links || []).map(link => ({ id: link.id, url: link.url, label: link.label, title: link.title, description: link.description, imageUrl: link.image_url })),
      } };
      const preview = await call('preview_org_event_changes', args);
      console.log(JSON.stringify(preview, null, 2));
      if (!preview.previewId) throw new Error('Missing preview receipt; no changes applied.');
      plans.push({ args, preview });
    }
    if (values.apply) {
      if (!process.stdin.isTTY) throw new Error('Run --apply in an interactive terminal to review and approve the previews.');
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      let answer;
      try { answer = await prompt.question('Apply both displayed previews? [y/N] '); } finally { prompt.close(); }
      if (answer.trim().toLowerCase() === 'y') {
        for (const { args, preview } of plans) {
          try { console.log(JSON.stringify(await call('apply_org_event_changes', { ...args, previewId: preview.previewId, confirm: true }), null, 2)); }
          catch { throw new Error(`Apply outcome uncertain for ${args.event.slug}; inspect the event and operation ${preview.previewId} before retrying.`); }
        }
      }
    } else console.log('Preview only. Run with --apply to review and confirm the updates.');
  }
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  await client?.close();
  await connection?.close();
  await store?.release();
}
