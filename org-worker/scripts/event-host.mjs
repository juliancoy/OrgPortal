#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { browserLogin } from './event-upload.mjs';
import { credentialStore } from './upload-connection.mjs';
const { values } = parseArgs({ options: {
  connection: { type: 'string' },
  resource: { type: 'string', default: 'https://lifetech.fyi/api/org/mcp' },
  issuer: { type: 'string', default: 'https://id.codecollective.us' },
  event: { type: 'string' }, tags: { type: 'string' }, organization: { type: 'string', default: 'ef646755-9443-4c7b-ba4b-a7a29754f666' },
  'preview-id': { type: 'string' }, apply: { type: 'boolean' },
} });
if (!values.event || (values.apply && !values['preview-id'])) {
  console.error('event-host.mjs --event EVENT_ID --organization DESTINATION_ORG_ID [--tags COMMA_SEPARATED] [--connection NAME] [--apply --preview-id REVIEWED_PREVIEW_ID] [--resource MCP_URL]');
  process.exit(1);
}
let store, connection, client;
try {
  store = await credentialStore(values.resource, values.issuer, values.connection);
  connection = await browserLogin(values.resource, values.issuer, undefined, true, { store, scope: 'org:events.read org:events.write', clientName: 'OrgPortal event host' });
  client = new Client({ name: 'orgportal-event-host', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(values.resource), { fetch: async (url, init) => {
    const headers = new Headers(init?.headers); headers.set('authorization', `Bearer ${await connection.accessToken()}`);
    return fetch(url, { ...init, headers });
  } }));
  const result = await client.callTool({ name: values.apply ? 'apply_event_host' : 'preview_event_host', arguments: {
    eventId: values.event, organizationId: values.organization,
    ...(values.tags ? { tags: values.tags.split(',').map(tag => tag.trim()).filter(Boolean) } : {}),
    ...(values.apply ? { confirm: true, previewId: values['preview-id'] } : {}),
  } });
  if (result.isError) throw new Error(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'));
  console.log(JSON.stringify(result.structuredContent || JSON.parse(result.content.find(item => item.type === 'text').text), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await client?.close(); await connection?.close(); await store?.release(); }
