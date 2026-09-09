import { EventIntegrationError } from "./eventPlatforms";

export type OperationOwner = { userId: string; organizationId: string; eventId: string };
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export async function previewFingerprint(preview: unknown) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(preview)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export async function enforceEventRateLimit(db: D1Database, userId: string, now = Date.now()) {
  const window = Math.floor(now / 60000);
  const row = await db.prepare(`INSERT INTO event_mcp_rate_limits (actor_user_id, window_start, requests)
    VALUES (?, ?, 1) ON CONFLICT(actor_user_id) DO UPDATE SET
    window_start = excluded.window_start,
    requests = CASE WHEN event_mcp_rate_limits.window_start = excluded.window_start THEN event_mcp_rate_limits.requests + 1 ELSE 1 END
    WHERE event_mcp_rate_limits.window_start != excluded.window_start OR event_mcp_rate_limits.requests < 60
    RETURNING requests`).bind(userId, window).first();
  if (!row) throw new EventIntegrationError(429, "Event request limit reached; retry in one minute");
}
export async function prepareEventOperation(db: D1Database, owner: OperationOwner, fingerprint: string, now = Date.now()) {
  const previewId = crypto.randomUUID();
  const expiresAt = now + 10 * 60000;
  await db.prepare(`INSERT INTO event_mcp_operations
    (id, actor_user_id, organization_id, event_id, fingerprint, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 'prepared', ?, ?)`).bind(previewId, owner.userId, owner.organizationId, owner.eventId, fingerprint, now, expiresAt).run();
  return { previewId, expiresAt: new Date(expiresAt).toISOString() };
}
export async function claimEventOperation(db: D1Database, owner: OperationOwner, previewId: string, fingerprint: string, now = Date.now()) {
  // One atomic conditional update prevents concurrent replays across Worker instances.
  const row = await db.prepare(`UPDATE event_mcp_operations SET status = 'executing'
    WHERE id = ? AND actor_user_id = ? AND organization_id = ? AND event_id = ?
      AND fingerprint = ? AND status = 'prepared' AND expires_at > ? RETURNING id`)
    .bind(previewId, owner.userId, owner.organizationId, owner.eventId, fingerprint, now).first();
  if (!row) throw new EventIntegrationError(409, "Preview is expired, changed, already used, or belongs to another user. Inspect the event and request a new preview.");
}
export async function finishEventOperation(db: D1Database, id: string, success: boolean, completed: string[]) {
  await db.prepare(`UPDATE event_mcp_operations SET status = ?, completed_at = ?, completed_steps_json = ?
    WHERE id = ? AND status = 'executing'`).bind(success ? "completed" : "uncertain", Date.now(), JSON.stringify(completed), id).run();
}
export async function eventOperationStatus(db: D1Database, userId: string, organizationId: string, previewId: string) {
  const row = await db.prepare(`SELECT id, event_id, status, created_at, expires_at, completed_at, completed_steps_json
    FROM event_mcp_operations WHERE id = ? AND actor_user_id = ? AND organization_id = ?`)
    .bind(previewId, userId, organizationId).first<Record<string, unknown>>();
  if (!row) throw new EventIntegrationError(404, "Event operation not found");
  return { ...row, warning: row.status === "executing" || row.status === "uncertain"
    ? "Provider outcome may be unknown. Inspect the live event before creating a new operation." : undefined };
}
