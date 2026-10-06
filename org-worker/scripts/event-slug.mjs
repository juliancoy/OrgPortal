#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { browserLogin } from './event-upload.mjs';
import { credentialStore } from './upload-connection.mjs';
const { values } = parseArgs({ options: {
  resource: { type: 'string', default: 'https://medtech.social/api/org/mcp' },
  issuer: { type: 'string', default: 'https://id.codecollective.us' },
  event: { type: 'string' }, slug: { type: 'string' }, organization: { type: 'string', default: 'org-baltimore-medtech' },
  'preview-id': { type: 'string' }, apply: { type: 'boolean' },
} });
if (!values.event || !values.slug || (values.apply && !values['preview-id'])) {
  console.error('event-slug.mjs --event EVENT_ID --slug NEW_SLUG [--apply --preview-id REVIEWED_PREVIEW_ID] [--resource MCP_URL]');
  process.exit(1);
}
let store, connection, client;
try {
  store = await credentialStore(values.resource, values.issuer);
  connection = await browserLogin(values.resource, values.issuer, undefined, true, { store, scope: 'org:events.read org:events.write', clientName: 'OrgPortal event links' });
  client = new Client({ name: 'orgportal-event-links', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(values.resource), { fetch: async (url, init) => {
    const headers = new Headers(init?.headers); headers.set('authorization', `Bearer ${await connection.accessToken()}`);
    return fetch(url, { ...init, headers });
  } }));
  const result = await client.callTool({ name: values.apply ? 'apply_event_slug' : 'preview_event_slug', arguments: {
    eventId: values.event, organizationId: values.organization, slug: values.slug,
    ...(values.apply ? { confirm: true, previewId: values['preview-id'] } : {}),
  } });
  if (result.isError) throw new Error(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'));
  console.log(JSON.stringify(result.structuredContent || JSON.parse(result.content.find(item => item.type === 'text').text), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await client?.close(); await connection?.close(); await store?.release(); }
