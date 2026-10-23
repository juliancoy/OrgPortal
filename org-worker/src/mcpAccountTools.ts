import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import product from '../../shared/mcp-product.json';
import { buildMetadata } from './generated/buildMetadata';

type Identity = { userId: string; scopes: string[]; subject: string; expiresAt: number; isOperator: boolean; email?: string | null; emailVerified?: boolean | null };
type Configuration = { resource: string; issuer: string; metadataUrl: string; introspection?: string; organizationId?: string };
const scope = 'org:portal.read';
const serverSchema = z.object({ name: z.literal('OrgPortal'), version: z.string(), commit: z.string().nullable() });
const statusSchema = z.object({
  authenticated: z.literal(true), account: z.object({ userId: z.string(), subject: z.string(), isOperator: z.boolean(), email: z.string().nullable(), emailVerified: z.boolean().nullable() }),
  resource: z.string(), issuer: z.string(), organizationId: z.string().nullable(), scopes: z.array(z.string()),
  expiresAt: z.string(), revocationChecked: z.boolean(), server: serverSchema,
  accountSwitch: z.object({ managedBy: z.literal('client'), instructions: z.string() }),
});
const organizationSchema = z.object({ id: z.string(), name: z.string(), slug: z.string(), role: z.string() });
const accountSchema = statusSchema.extend({ organizations: z.array(organizationSchema), organizationsTruncated: z.boolean() });
const checkSchema = z.object({ code: z.string(), status: z.enum(['pass', 'warn', 'fail']), message: z.string() });
const diagnosticSchema = z.object({ ok: z.boolean(), checks: z.array(checkSchema), connection: statusSchema });

export function connectionStatus(identity: Identity, config: Configuration) {
  return {
    authenticated: true as const,
    account: { userId: identity.userId, subject: identity.subject, isOperator: identity.isOperator, email: identity.email ?? null, emailVerified: identity.emailVerified ?? null },
    resource: config.resource, issuer: config.issuer, organizationId: config.organizationId || null,
    scopes: [...new Set(identity.scopes)].filter(Boolean).sort(), expiresAt: new Date(identity.expiresAt * 1000).toISOString(),
    revocationChecked: Boolean(config.introspection),
    server: { name: 'OrgPortal' as const, version: product.version, commit: buildMetadata.commit },
    accountSwitch: { managedBy: 'client' as const, instructions: 'Select another named connection in your MCP client. In OrgPortal CLI use auth list and auth switch NAME. Reconnect through PIdP to add another account; this tool cannot select a client connection.' },
  };
}

export function registerAccountTools(server: McpServer, db: D1Database, identity: Identity, config: Configuration) {
  const status = () => connectionStatus(identity, config);
  const register = (name: string, title: string, description: string, outputSchema: typeof statusSchema | typeof accountSchema | typeof diagnosticSchema, read: () => Promise<Record<string, unknown>>) => {
    server.registerTool(name, { title, description, inputSchema: z.object({}).strict(), outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { securitySchemes: [{ type: 'oauth2', scopes: [scope] }] },
    }, async () => {
      if (!identity.scopes.includes(scope)) {
        const error = { error: { code: 'insufficient_scope', message: 'Authorize org:portal.read to inspect this connection.', retryable: false } };
        return { isError: true, structuredContent: error, content: [{ type: 'text' as const, text: JSON.stringify(error) }],
          _meta: { 'mcp/www_authenticate': [`Bearer resource_metadata="${config.metadataUrl}", error="insufficient_scope", scope="${scope}"`] } };
      }
      try {
        const data = await read();
        return { structuredContent: data, content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch {
        const error = { error: { code: 'connection_check_unavailable', message: 'Connection checks are temporarily unavailable. Retry this read-only request.', retryable: true } };
        return { isError: true, structuredContent: error, content: [{ type: 'text' as const, text: JSON.stringify(error) }] };
      }
    });
  };
  register(product.accountTools.status, 'Connection status', 'Show the authenticated account, granted scopes, expiry, tenant boundary and server version for this connection. Never returns credentials or changes the selected account.', statusSchema, async () => status());
  register(product.accountTools.whoami, 'Current account', 'Identify the authenticated account and its active organization memberships. Tenant connections show only their own organization. Account IDs come from verified identity, never email inference.', accountSchema, async () => {
    const rows = await db.prepare(`SELECT o.id, o.name, o.slug, m.role FROM organizations o
      JOIN organization_memberships m ON m.organization_id = o.id
      WHERE m.user_id = ? AND m.status = 'active' ${config.organizationId ? 'AND o.id = ?' : ''}
      ORDER BY lower(o.name), o.id LIMIT 501`).bind(identity.userId, ...(config.organizationId ? [config.organizationId] : [])).all<z.infer<typeof organizationSchema>>();
    return { ...status(), organizations: rows.results.slice(0, 500), organizationsTruncated: rows.results.length > 500 };
  });
  register(product.accountTools.doctor, 'Connection diagnostics', 'Check this authenticated MCP connection and organization database without changing data. Reports live revocation validation separately from token verification. Cannot inspect other client connections.', diagnosticSchema, async () => {
    const checks: z.infer<typeof checkSchema>[] = [
      { code: 'authentication', status: 'pass', message: 'Token signature, issuer, resource and expiry verified for this request.' },
      { code: 'revocation', status: config.introspection ? 'pass' : 'warn', message: config.introspection ? 'PIdP confirmed this grant is active.' : 'Live revocation checking is not configured for this resource.' },
    ];
    try { const row = await db.prepare('SELECT 1 AS ok').first<{ok:number}>(); if (row?.ok !== 1) throw Error('Database check failed'); checks.push({ code: 'database', status: 'pass', message: 'Organization database is reachable.' }); }
    catch { checks.push({ code: 'database', status: 'fail', message: 'Organization database is unavailable. Contact OrgPortal support.' }); }
    return { ok: checks.every(check => check.status === 'pass'), checks, connection: status() };
  });
}
