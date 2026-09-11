import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import { eventPlanSchema, executeEventPlan, LumaEventProvider, configuredProvider, type EventProvider } from "../src/eventPlatforms";
import { authenticateMcp, handleEventMcp, protectedResourceMetadata, runEventCommentsOperation, runEventOperation, runNativeEventOperation } from "../src/eventMcp";
import { app } from "../src/index";
import { EventTestDb } from "./event-test-db";

const config = { provider: "luma", calendarId: "cal-one", apiKeyBinding: "EVENT_KEY_ONE",
  branding: { tintColor: "#0f6f8f", sourceUrl: "https://medtech.social", revision: "reviewed-commit" } };
const current = { id: "evt-one", name: "Formation", startAt: "2026-09-01T22:00:00Z", endAt: "2026-09-02T00:30:00Z", timezone: "America/New_York" };
const update = { startAt: "2026-09-29T22:00:00Z", endAt: "2026-09-30T00:30:00Z", timezone: "America/New_York" };
const plan = { organizationId: "org-one", eventId: "evt-one", update };
function fakeProvider() {
  const writes: unknown[] = [];
  const provider: EventProvider = {
    list: async () => ({ events: [current] }), get: async () => current, validateUpdate: () => {},
    update: async (...args) => { writes.push(args); }, addCollaborator: async (...args) => { writes.push(args); },
  };
  return { provider, writes };
}
test("plans default to preview, apply approved branding, and never write", async () => {
  const { provider, writes } = fakeProvider();
  const result = await executeEventPlan(provider, config, { ...plan, applyBranding: true });
  assert.equal(result.dryRun, true);
  assert.equal("update" in result && result.update.tintColor, "#0f6f8f");
  assert.deepEqual(writes, []);
});
test("confirmed plans apply exact fields and collaborator permissions", async () => {
  const { provider, writes } = fakeProvider();
  const collaborator = { email: "verified@example.org", accessLevel: "manager", isVisible: true };
  const result = await executeEventPlan(provider, config, { ...plan, collaborator, confirm: true });
  assert.equal("success" in result && result.success, true);
  assert.deepEqual(writes, [["evt-one", update], ["evt-one", collaborator]]);
});
test("invalid changes fail before any write", async () => {
  const { provider, writes } = fakeProvider();
  for (const input of [{ ...plan, update: { timezone: "bogus" } }, { ...plan, update: { unrecognized: true } },
    { ...plan, confirm: "true" }, { ...plan, update: { startAt: "2026-09-30T22:00:00Z" } },
    { ...plan, collaborator: { email: "Palava Hut" } }]) {
    await assert.rejects(executeEventPlan(provider, config, input));
  }
  assert.deepEqual(writes, []);
  assert.equal(eventPlanSchema.safeParse({ organizationId: "org-one", eventId: "evt-one" }).success, false);
});
test("partial upstream failure is explicit and is not automatically retried", async () => {
  const { provider, writes } = fakeProvider();
  provider.addCollaborator = async () => { throw new Error("secret upstream payload"); };
  const result = await executeEventPlan(provider, config, { ...plan, confirm: true,
    collaborator: { email: "verified@example.org", accessLevel: "manager", isVisible: true } });
  assert.equal("success" in result && result.success, false);
  assert.deepEqual("completed" in result && result.completed, ["update"]);
  assert.equal(writes.length, 1);
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("Luma rejects cross-calendar access, unsafe covers, and sanitizes upstream errors", async () => {
  const fetcher = (async () => Response.json({ calendar_id: "cal-other", access: "manage" })) as typeof fetch;
  const provider = new LumaEventProvider(config, "secret", fetcher);
  await assert.rejects(provider.get("evt-other"), /not managed/);
  await assert.rejects(provider.update("evt-other", update), /not managed/);
  assert.throws(() => provider.validateUpdate({ coverUrl: "https://evil.example/image.png" }), /lumacdn/);
  const broken = new LumaEventProvider(config, "secret", (async () => new Response("private upstream data", { status: 403 })) as typeof fetch);
  await assert.rejects(broken.get("evt-one"), /^Error: Event provider returned HTTP 403$/);
});
test("Luma maps fields, filters calendar listings, encodes cursors and never follows redirects", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const event = { id: "evt-one", calendar_id: "cal-one", access: "manage", name: "Formation", start_at: current.startAt, end_at: current.endAt };
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Response.json(url.includes("calendars/events/list") ? { entries: [event, { ...event, calendar_id: "cal-other" }], has_more: true, next_cursor: "next" } : event);
  }) as typeof fetch;
  const provider = new LumaEventProvider(config, "test-key", fetcher);
  assert.equal((await provider.list("&access=view")).events.length, 1);
  assert.ok(calls[0].url.includes("pagination_cursor=%26access%3Dview"));
  await provider.update("evt-one", update);
  assert.deepEqual(JSON.parse(String(calls.at(-1)?.init?.body)), { event_id: "evt-one", start_at: update.startAt, end_at: update.endAt, timezone: update.timezone });
  assert.ok(calls.every(call => call.init?.redirect === "error"));
});
test("organization configuration is required and prototype keys are denied", () => {
  assert.throws(() => configuredProvider({} as Env, "org-one"), /not configured/);
  assert.throws(() => configuredProvider({ EVENT_INTEGRATIONS_JSON: "{}" } as Env, "constructor"), /not configured/);
});

const authEnv = { MCP_PUBLIC_URL: "https://portal.example/api/org/mcp", MCP_OAUTH_ISSUER: "https://auth.example",
  MCP_OAUTH_JWKS_URL: "https://auth.example/jwks", MCP_SUBJECT_MAP_JSON: JSON.stringify({ subject: "pidp-user" }) } as Env;
test("JWT verifies audience, issuer, expiration and explicit subject mapping", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const getKey = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
  async function signed(overrides = {}) {
    return new SignJWT({ sub: "subject", iss: authEnv.MCP_OAUTH_ISSUER, aud: authEnv.MCP_PUBLIC_URL,
      scope: "org:events.read", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 60, ...overrides })
      .setProtectedHeader({ alg: "RS256" }).sign(privateKey);
  }
  const request = (token: string) => new Request(authEnv.MCP_PUBLIC_URL!, { headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual(await authenticateMcp(request(await signed()), authEnv, getKey), { userId: "pidp-user", scopes: ["org:events.read"] });
  for (const overrides of [{ aud: "wrong" }, { iss: "wrong" }, { exp: 1 }, { sub: "unmapped" }]) {
    await assert.rejects(authenticateMcp(request(await signed(overrides)), authEnv, getKey), /Invalid/);
  }
});
test("MCP routes fail closed, advertise resource metadata, reject origins and require auth", async () => {
  const request = new Request("https://portal.example/mcp", { method: "POST" });
  assert.equal((await handleEventMcp(request, {} as Env)).status, 503);
  const response = await app.request(request, undefined, authEnv);
  assert.equal(response.status, 401);
  const challenge = response.headers.get("www-authenticate") || "";
  assert.ok(challenge.includes("/.well-known/oauth-protected-resource/api/org/mcp?v=20260910-2"));
  assert.equal(protectedResourceMetadata(authEnv).resource, authEnv.MCP_PUBLIC_URL);
  assert.equal((await handleEventMcp(new Request(request, { headers: { origin: "https://evil.example" } }), authEnv)).status, 403);
});
test("writes require write scope before consulting database or provider", async () => {
  await assert.rejects(runEventOperation(authEnv, { userId: "pidp-user", scopes: ["org:events.read"] }, "plan", { ...plan, confirm: true }), /Missing event scope/);
});
test("native event changes preview, apply once, and write OrgPortal events", async () => {
  const db = new EventTestDb();
  const env = { ...authEnv, DB: db } as unknown as Env;
  const input = { organizationId: "org-one", event: {
    ingestKey: "manual:event-one",
    title: "Native formation",
    slug: "native-formation",
    description: "Portal-owned event",
    startsAt: "2026-09-17T22:00:00Z",
    endsAt: "2026-09-18T00:30:00Z",
    location: "To Be Announced",
    sourceUrl: null,
    imageUrl: "https://images.example/event.png",
    tags: ["medtech"],
    city: "Baltimore",
  } };
  try {
    const identity = { userId: "pidp-user", scopes: ["org:events.read", "org:events.write"] };
    const preview = await runNativeEventOperation(env, identity, input) as { previewId: string; event: { slug: string } };
    assert.equal(preview.event.slug, "native-formation");
    const applied = await runNativeEventOperation(env, identity, { ...input, confirm: true, previewId: preview.previewId }) as { success: boolean };
    assert.equal(applied.success, true);
    const rows = await db.prepare("SELECT title, slug, host_org_id, source_url, tags FROM events WHERE ingest_key = ?")
      .bind("manual:event-one").all();
    assert.deepEqual(rows.results.map(row => ({ ...row })), [
      { title: "Native formation", slug: "native-formation", host_org_id: "org-one", source_url: null, tags: '["medtech"]' },
    ]);
    await assert.rejects(runNativeEventOperation(env, identity, { ...input, confirm: true, previewId: preview.previewId }), /Preview is expired/);
  } finally {
    db.close();
  }
});
test("event comments can be enabled through previewed MCP operations", async () => {
  const db = new EventTestDb();
  const env = { ...authEnv, DB: db } as unknown as Env;
  const identity = { userId: "pidp-user", scopes: ["org:events.read", "org:events.write"] };
  await db.prepare(
    `INSERT INTO events
      (id, ingest_key, title, slug, host_org_id, host_org_name, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind("event-one", "manual:event-one", "Native formation", "native-formation", "org-one", "One", "[]", "2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z")
    .run();
  try {
    const input = {
      organizationId: "one",
      eventSlug: "native-formation",
      conversationId: "event-room-native-formation",
      roomName: "Native formation comments",
    };
    const preview = await runEventCommentsOperation(env, identity, input) as { previewId: string; event: { next: { conversationId: string; roomName: string } } };
    assert.equal(preview.event.next.conversationId, "event-room-native-formation");
    assert.equal(preview.event.next.roomName, "Native formation comments");
    const applied = await runEventCommentsOperation(env, identity, { ...input, confirm: true, previewId: preview.previewId }) as { success: boolean };
    assert.equal(applied.success, true);
    const row = await db.prepare("SELECT event_chat_room_id, event_chat_room_alias, event_chat_room_name FROM events WHERE slug = ?").bind("native-formation").first() as any;
    assert.equal(row.event_chat_room_id, "event-room-native-formation");
    assert.equal(row.event_chat_room_alias, null);
    assert.equal(row.event_chat_room_name, "Native formation comments");
    await assert.rejects(runEventCommentsOperation(env, identity, { ...input, confirm: true, previewId: preview.previewId }), /Preview is expired/);
  } finally {
    db.close();
  }
});
test("organization management is required even with write scope", async () => {
  const env = { ...authEnv, DB: { prepare: (sql: string) => ({ bind: () => ({ first: async () =>
    sql.includes("FROM organizations") ? { id: "org-one", name: "One" } : { role: "member" } }) }) } } as unknown as Env;
  await assert.rejects(runEventOperation(env, { userId: "pidp-user", scopes: ["org:events.read", "org:events.write"] }, "plan", { ...plan, confirm: true }), /management access required/);
});
test("authenticated MCP initializes, lists tools and previews through the shared provider", async () => {
  const db = new EventTestDb();
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const token = await new SignJWT({ scope: "org:events.read" }).setProtectedHeader({ alg: "RS256" })
    .setSubject("subject").setIssuer(authEnv.MCP_OAUTH_ISSUER!).setAudience(authEnv.MCP_PUBLIC_URL!)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const env = { ...authEnv, EVENT_INTEGRATIONS_JSON: JSON.stringify({ "org-one": config }), EVENT_KEY_ONE: "server-key",
    DB: db } as unknown as Env;
  const originalFetch = globalThis.fetch;
  const writes: unknown[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === authEnv.MCP_OAUTH_JWKS_URL) return Response.json({ keys: [jwk] });
    if (init?.method === "POST") writes.push(input);
    assert.ok(url.startsWith("https://public-api.luma.com/v1/events/get?"));
    return Response.json({ id: current.id, name: current.name, calendar_id: "cal-one", access: "manage", start_at: current.startAt, end_at: current.endAt });
  }) as typeof fetch;
  const rpc = async (method: string, params: unknown) => {
    const response = await handleEventMcp(new Request(authEnv.MCP_PUBLIC_URL!, { method: "POST", headers: {
      authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), env);
    assert.equal(response.status, 200);
    return response.json() as Promise<any>;
  };
  try {
    assert.equal((await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } })).result.serverInfo.name, "orgportal-events");
    const listed = await rpc("tools/list", {});
    assert.equal(listed.result.tools.length, 13);
    assert.ok(listed.result.tools.every((tool: any) => tool.securitySchemes[0].type === "oauth2"));
    assert.equal(listed.result.tools.find((t: any) => t.name === "apply_event_changes").annotations.destructiveHint, true);
    assert.equal(listed.result.tools.find((t: any) => t.name === "apply_org_event_changes").annotations.idempotentHint, true);
    assert.equal(listed.result.tools.find((t: any) => t.name === "apply_event_comments").annotations.idempotentHint, true);
    assert.ok(listed.result.tools.find((t: any) => t.name === "save_portal_setup"));
    assert.ok(listed.result.tools.find((t: any) => t.name === "request_portal_custom_domain"));
    assert.ok(listed.result.tools.find((t: any) => t.name === "attach_portal_custom_domain"));
    const preview = await rpc("tools/call", { name: "preview_event_changes", arguments: { ...plan, confirm: true } });
    assert.equal(preview.result.structuredContent.dryRun, true);
    assert.match(preview.result.structuredContent.previewId, /^[0-9a-f-]{36}$/);
    const denied = await rpc("tools/call", { name: "apply_event_changes", arguments: { ...plan, confirm: true } });
    assert.equal(denied.result.isError, true);
    assert.ok(denied.result._meta["mcp/www_authenticate"][0].includes("insufficient_scope"));
    assert.deepEqual(writes, []);
  } finally { globalThis.fetch = originalFetch; db.close(); }
});

test("MCP exposes organization portal setup and custom-domain flow", async () => {
  const db = new EventTestDb();
  const portalAuthEnv = { ...authEnv, MCP_OAUTH_JWKS_URL: "https://auth.example/portal-jwks" };
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const token = await new SignJWT({ scope: "org:portal.read org:portal.write" }).setProtectedHeader({ alg: "RS256" })
    .setSubject("subject").setIssuer(portalAuthEnv.MCP_OAUTH_ISSUER!).setAudience(portalAuthEnv.MCP_PUBLIC_URL!)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const env = { ...portalAuthEnv, PUBLIC_PORTAL_BASE_URL: "https://codecollective.test/p", DB: db } as unknown as Env;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === portalAuthEnv.MCP_OAUTH_JWKS_URL) return Response.json({ keys: [jwk] });
    return new Response("unexpected fetch", { status: 500 });
  }) as typeof fetch;
  const rpc = async (name: string, args: unknown) => {
    const response = await handleEventMcp(new Request(portalAuthEnv.MCP_PUBLIC_URL!, { method: "POST", headers: {
      authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env);
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.equal(payload.result.isError, undefined);
    return payload.result.structuredContent;
  };
  try {
    const saved = await rpc("save_portal_setup", { organizationId: "org-one", slug: "one", name: "One Portal", homeKind: "landing" });
    assert.equal(saved.portal.slug, "one");
    assert.equal(saved.portal.slug_url, "https://codecollective.test/p/portals/one");
    const requested = await rpc("request_portal_custom_domain", { organizationId: "org-one", hostname: "one.example.org", notes: "ready for DNS" });
    assert.equal(requested.portal.custom_domain_status, "requested");
    assert.ok(requested.checklist.some((item: string) => item.includes("Cloudflare custom domain")));
    const attached = await rpc("attach_portal_custom_domain", { organizationId: "org-one", hostname: "one.example.org" });
    assert.equal(attached.portal.hostname, "one.example.org");
    assert.equal(attached.portal.public_base_url, "https://one.example.org");
    const loaded = await rpc("get_portal_setup", { organizationId: "org-one" });
    assert.equal(loaded.portal.custom_domain_status, "attached");
  } finally { globalThis.fetch = originalFetch; db.close(); }
});
