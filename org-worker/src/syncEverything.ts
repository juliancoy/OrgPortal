import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { authenticateMcp, eventErrorResponse, mcpConfiguration } from './eventMcp';
import { EventIntegrationError } from './eventPlatforms';
import { authorizeOrganization } from './organizationIam';

type Dispatch = (request: Request, env: Env) => Promise<Response>;
const object = z.record(z.string(), z.unknown());
const taskSchema = z.object({ tool: z.string().min(1).max(100), arguments: object }).strict();
const inputSchema = z.object({
  organizationId: z.string().min(1).max(200),
  mode: z.enum(['catalog', 'pull', 'preview', 'apply']).default('pull'),
  cursor: z.string().max(90000).optional(),
  limit: z.number().int().min(1).max(5).default(3),
  operation: z.object({ name: z.string().min(1).max(100), arguments: object,
    previewId: z.string().uuid().optional() }).strict().optional(),
}).strict();
const cursorSchema = z.object({ version: z.literal(1), subject: z.string(), resource: z.string(),
  organizationId: z.string(), expiresAt: z.number(), pending: z.array(taskSchema).max(500),
  seen: z.array(z.string().max(500)).max(1000) }).strict();
const rpcSchema = z.object({ error: z.unknown().optional(), result: z.unknown().optional() });
const resultSchema = z.object({ isError: z.boolean().optional(), structuredContent: z.unknown().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional() }).passthrough();
const toolsSchema = z.object({ tools: z.array(z.object({ name: z.string(),
  inputSchema: z.object({ properties: object.optional(), required: z.array(z.string()).optional() }).passthrough(),
  annotations: z.object({ readOnlyHint: z.boolean().optional() }).passthrough().optional(),
}).passthrough()), nextCursor: z.string().optional() });

// Only reviewed, receipt-enforcing domain operations. No raw table/SQL writes,
// identity operations, media legacy writes, or direct provider dispatch here.
const writes = new Set([
  'organization_profile', 'organization_personnel_scheme', 'organization_invitation',
  'organization_invitation_acceptance', 'organization_invitation_cancellation', 'personnel_relationship',
  'organization_support', 'void_organization_support', 'motion', 'motion_amendment', 'motion_action',
  'presentation_application', 'organization_tasks', 'organization_member_titles', 'organization_membership',
  'event_changes', 'event_host', 'event_slug', 'org_event_changes', 'event_company_ballot',
  'event_company_vote', 'venue_image_changes', 'event_comments', 'portal_branding',
]);
const rootReads: Array<z.infer<typeof taskSchema>> = [
  { tool: 'get_organization_profile', arguments: {} },
  { tool: 'get_portal_setup', arguments: {} },
  { tool: 'get_portal_branding', arguments: {} },
  { tool: 'list_organization_members', arguments: {} },
  { tool: 'get_organization_personnel_scheme', arguments: {} },
  { tool: 'list_organization_invitations', arguments: {} },
  { tool: 'list_my_personnel_relationships', arguments: {} },
  { tool: 'list_organization_support', arguments: {} },
  { tool: 'list_motions', arguments: { limit: 100 } },
  { tool: 'list_events', arguments: { source: 'native' } },
  { tool: 'get_organization_page_statistics', arguments: {} },
];
const detailReads = new Set(['get_event', 'get_event_company_votes', 'list_presentation_applications', 'get_motion']);
const exclusions = [
  'PIdP credentials, sessions, grants and identity databases',
  'Other accounts’ private content and secret ballots',
  'Chat service history, newsletter archives, provider credentials and provider-owned data',
  'Binary media bytes (metadata uses existing media URLs and upload APIs)',
  'Records outside existing authorized organization API projections',
];

function encodeCursor(value: z.infer<typeof cursorSchema>) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > 65000) throw new EventIntegrationError(413, 'Sync continuation exceeds its bound; use domain pagination');
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}
function decodeCursor(value: string) {
  try { return cursorSchema.parse(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0))))); }
  catch { throw new EventIntegrationError(400, 'Invalid sync cursor'); }
}

/** Stateless orchestration over the same authorized domain tools as MCP. */
export function syncEverythingRoutes(dispatch: Dispatch) {
  const routes = new Hono<{ Bindings: Env }>();
  routes.use('*', bodyLimit({ maxSize: 128 * 1024 }));
  routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); c.header('Vary', 'Authorization'); await next(); });
  routes.post('/everything', async c => {
    try {
      if (c.env.ORGANIZATION_REPLICA_SOURCE) throw new EventIntegrationError(409, 'Sync requires the authoritative production API');
      const config = mcpConfiguration(c.env, c.req.raw);
      if (!config.introspection) throw new EventIntegrationError(503, 'Sync requires live account revocation checks');
      const identity = await authenticateMcp(c.req.raw, c.env);
      const input = inputSchema.parse(await c.req.json());
      if (!identity.scopes.includes('org:portal.read') || (['preview', 'apply'].includes(input.mode) && !identity.scopes.includes('org:portal.write'))) throw new EventIntegrationError(403, 'Missing portal scope');
      if (config.organizationId && input.organizationId !== config.organizationId) throw new EventIntegrationError(403, 'Connection is limited to its own organization');
      await authorizeOrganization(c.env.DB, { id: identity.userId, name: identity.userId, email: null, isOperator: identity.isOperator === true }, 'read_members', input.organizationId);
      if (input.mode !== 'pull' && input.cursor) throw new EventIntegrationError(400, 'Cursors apply only to pulls');
      if (['pull', 'catalog'].includes(input.mode) && input.operation) throw new EventIntegrationError(400, 'Read requests cannot contain outgoing changes');

      // In-process dispatch: no HTTP fetch to ourselves, no operator credentials,
      // no copied role claims. Each domain rechecks its actual live permissions.
      const rpc = async (method: string, params: Record<string, unknown>) => {
        const headers = new Headers({ Authorization: c.req.header('Authorization') || '',
          'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' });
        const forwardedHost = c.req.header('x-forwarded-host');
        if (forwardedHost) headers.set('x-forwarded-host', forwardedHost);
        const response = await dispatch(new Request(config.resource, { method: 'POST', headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }) }), c.env);
        if (!response.ok) throw new EventIntegrationError(response.status === 401 ? 401 : 502, 'Authorized domain dispatch unavailable');
        const envelope = rpcSchema.parse(await response.json());
        if (envelope.error) throw new EventIntegrationError(502, 'Domain protocol request failed');
        return envelope.result;
      };
      const tools: z.infer<typeof toolsSchema>['tools'] = [];
      let toolCursor: string | undefined;
      do {
        const page = toolsSchema.parse(await rpc('tools/list', toolCursor ? { cursor: toolCursor } : {}));
        tools.push(...page.tools); toolCursor = page.nextCursor;
        if (tools.length > 500) throw new EventIntegrationError(502, 'Excessive domain tool catalog');
      } while (toolCursor);
      const available = new Map(tools.map(tool => [tool.name, tool]));
      const readNames = new Set([...rootReads.map(read => read.tool), ...detailReads]);
      const coverage = { complete: false, boundary: 'authorized-organization-API-records',
        consistency: 'live domain reads; no cross-domain snapshot transaction', exclusions,
        deletion: 'Reconcile only completed authorized collection snapshots; never infer deletion from errors or partial pages',
        cappedCollections: ['motions (100 per list; no domain cursor available)'] };
      if (input.mode === 'catalog') return c.json({ version: 1, organizationId: input.organizationId, coverage,
        reads: tools.filter(tool => readNames.has(tool.name) && tool.annotations?.readOnlyHint),
        operations: [...writes].filter(name => available.has('preview_' + name) && available.has('apply_' + name)) });

      if (input.mode === 'preview' || input.mode === 'apply') {
        const operation = input.operation;
        if (!operation || !writes.has(operation.name)) throw new EventIntegrationError(400, 'Select a supported domain operation');
        if (['organizationId', 'confirm', 'previewId'].some(key => key in operation.arguments)) throw new EventIntegrationError(400, 'Targets and receipts must use the sync envelope');
        if (input.mode === 'apply' && !operation.previewId) throw new EventIntegrationError(409, 'A reviewed exact domain previewId is required');
        const name = input.mode + '_' + operation.name, tool = available.get(name);
        if (!tool) throw new EventIntegrationError(409, 'Operation is unavailable for this connection');
        const properties = tool.inputSchema.properties || {};
        const args = { ...operation.arguments, organizationId: input.organizationId,
          ...('confirm' in properties ? { confirm: input.mode === 'apply' } : {}),
          ...(operation.previewId ? { previewId: operation.previewId } : {}) };
        const result = resultSchema.parse(await rpc('tools/call', { name, arguments: args }));
        return c.json({ version: 1, organizationId: input.organizationId, mode: input.mode,
          operation: operation.name, atomicBatch: false, ...result }, result.isError ? 409 : 200);
      }

      const state = input.cursor ? decodeCursor(input.cursor) : { version: 1 as const, subject: identity.subject,
        resource: config.resource, organizationId: input.organizationId, expiresAt: Date.now() + 10 * 60000,
        pending: rootReads.map(task => ({ ...task, arguments: { ...task.arguments } })), seen: [] as string[] };
      if (state.subject !== identity.subject || state.resource !== config.resource || state.organizationId !== input.organizationId || state.expiresAt <= Date.now()) throw new EventIntegrationError(409, 'Sync cursor is expired or belongs to another dataset/account');
      const records: Array<{ tool: string; arguments: Record<string, unknown>; result: z.infer<typeof resultSchema> }> = [];
      for (let count = 0; count < input.limit && state.pending.length; count++) {
        const task = state.pending.shift()!;
        if (!readNames.has(task.tool) || !available.get(task.tool)?.annotations?.readOnlyHint) throw new EventIntegrationError(400, 'Unsupported sync read');
        const args = { ...task.arguments, organizationId: input.organizationId };
        const result = resultSchema.parse(await rpc('tools/call', { name: task.tool, arguments: args }));
        records.push({ tool: task.tool, arguments: args, result });
        const data = result.structuredContent;
        if (!result.isError && data && typeof data === 'object' && !Array.isArray(data)) {
          const record = object.parse(data);
          if (typeof record.nextCursor === 'string' && record.nextCursor) state.pending.unshift({ tool: task.tool, arguments: { ...task.arguments, cursor: record.nextCursor } });
          const queue = (tool: string, key: string, id: unknown) => {
            if (typeof id !== 'string' || !id || id.length > 200) return;
            const tag = tool + ':' + id;
            if (!state.seen.includes(tag)) { state.seen.push(tag); state.pending.push({ tool, arguments: { [key]: id, ...(tool === 'get_event' ? { source: 'native' } : {}) } }); }
          };
          if (task.tool === 'list_events' && Array.isArray(record.events)) for (const entry of record.events) {
            const row = object.parse(entry);
            for (const tool of ['get_event', 'get_event_company_votes', 'list_presentation_applications']) queue(tool, 'eventId', row.id);
          }
          if (task.tool === 'list_motions' && Array.isArray(record.motions)) for (const entry of record.motions) queue('get_motion', 'motionId', object.parse(entry).id);
        }
        if (new TextEncoder().encode(JSON.stringify(records)).length > 1024 * 1024) throw new EventIntegrationError(413, 'Sync page exceeds 1 MiB; retry with a smaller limit or use domain APIs');
      }
      const nextCursor = state.pending.length ? encodeCursor(cursorSchema.parse(state)) : null;
      return c.json({ version: 1, organizationId: input.organizationId, resource: config.resource,
        records, nextCursor, cycleComplete: !nextCursor, coverage });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ detail: 'Invalid sync request or domain response' }, 400);
      return eventErrorResponse(error, c.env, c.req.raw);
    }
  });
  return routes;
}
