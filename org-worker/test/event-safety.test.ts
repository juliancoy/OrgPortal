import assert from "node:assert/strict";
import test from "node:test";
import { EventTestDb } from "./event-test-db";
import { canonicalJson, previewFingerprint, enforceEventRateLimit, prepareEventOperation, claimEventOperation, finishEventOperation, eventOperationStatus } from "../src/eventOperationStore";
import { checkEventConfiguration } from "../src/eventConfiguration";
import { runEventOperation, handleEventMcp } from "../src/eventMcp";
import { eventProviders, type EventProvider } from "../src/eventPlatforms";

const owner = { userId: "pidp-user", organizationId: "org-one", eventId: "evt-one" };
test("fingerprints are stable across object ordering, but change with content", async () => {
  assert.equal(canonicalJson({ b: 2, a: 1, c: undefined }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(await previewFingerprint({ a: 1, b: 2 }), await previewFingerprint({ b: 2, a: 1 }));
  assert.notEqual(await previewFingerprint({ a: 1 }), await previewFingerprint({ a: 2 }));
});
test("receipt claim is one-use and bound to principal, organization, event, content and expiry", async () => {
  const db = new EventTestDb() as unknown as D1Database & { close(): void };
  try {
    const receipt = await prepareEventOperation(db, owner, "fingerprint", 1000);
    for (const other of [{ ...owner, userId: "other" }, { ...owner, organizationId: "other" }, { ...owner, eventId: "other" }]) {
      await assert.rejects(claimEventOperation(db, other, receipt.previewId, "fingerprint", 1001), /belongs to another/);
    }
    await assert.rejects(claimEventOperation(db, owner, receipt.previewId, "changed", 1001));
    await assert.rejects(claimEventOperation(db, owner, receipt.previewId, "fingerprint", 601000));
    const results = await Promise.allSettled([claimEventOperation(db, owner, receipt.previewId, "fingerprint", 1001), claimEventOperation(db, owner, receipt.previewId, "fingerprint", 1001)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    await finishEventOperation(db, receipt.previewId, false, ["update"]);
    assert.equal((await eventOperationStatus(db, owner.userId, owner.organizationId, receipt.previewId)).status, "uncertain");
    await assert.rejects(eventOperationStatus(db, "other", owner.organizationId, receipt.previewId), /not found/);
  } finally { db.close(); }
});
test("rate limit is atomic and resets in the next window", async () => {
  const db = new EventTestDb() as unknown as D1Database & { close(): void };
  try {
    for (let i = 0; i < 60; i++) await enforceEventRateLimit(db, "one", 1000);
    await assert.rejects(enforceEventRateLimit(db, "one", 1000), /limit reached/);
    await enforceEventRateLimit(db, "other", 1000);
    await enforceEventRateLimit(db, "one", 61000);
  } finally { db.close(); }
});
test("shared execution requires an unchanged preview and cannot replay a successful write", async () => {
  const db = new EventTestDb();
  const writes: unknown[] = [];
  let current = { id: "evt-one", name: "Formation", startAt: "2026-09-01T22:00:00Z", endAt: "2026-09-02T00:30:00Z", timezone: "America/New_York" };
  const provider: EventProvider = { list: async () => ({ events: [current] }), get: async () => current, validateUpdate: () => {},
    update: async (...args) => { writes.push(args); }, addCollaborator: async (...args) => { writes.push(args); } };
  eventProviders.set("test", () => provider);
  const env = { DB: db, EVENT_KEY_TEST: "not-a-live-key", EVENT_INTEGRATIONS_JSON: JSON.stringify({ "org-one": { provider: "test", calendarId: "cal-one", apiKeyBinding: "EVENT_KEY_TEST" } }) } as unknown as Env;
  const identity = { userId: "pidp-user", scopes: ["org:events.read", "org:events.write"] };
  const plan = { organizationId: "org-one", eventId: "evt-one", update: { name: "New name" } };
  try {
    await assert.rejects(runEventOperation(env, identity, "plan", { ...plan, confirm: true }), /preview first/);
    const preview: any = await runEventOperation(env, identity, "plan", plan);
    await assert.rejects(runEventOperation(env, identity, "plan", { ...plan, update: { name: "Changed" }, confirm: true, previewId: preview.previewId }), /Preview is/);
    current = { ...current, name: "Upstream edit" };
    await assert.rejects(runEventOperation(env, identity, "plan", { ...plan, confirm: true, previewId: preview.previewId }), /Preview is/);
    assert.equal(writes.length, 0);
    const fresh: any = await runEventOperation(env, identity, "plan", plan);
    const applied: any = await runEventOperation(env, identity, "plan", { ...plan, confirm: true, previewId: fresh.previewId });
    assert.equal(applied.success, true);
    assert.equal(writes.length, 1);
    await assert.rejects(runEventOperation(env, identity, "plan", { ...plan, confirm: true, previewId: fresh.previewId }), /Preview is/);
    assert.equal(writes.length, 1);
    const status: any = await runEventOperation(env, identity, "status", { organizationId: "org-one", previewId: fresh.previewId });
    assert.equal(status.status, "completed");
  } finally { eventProviders.delete("test"); db.close(); }
});
test("offline configuration checks reject missing settings without exposing values", async () => {
  const secret = "DO-NOT-PRINT-ME";
  const result = checkEventConfiguration({ MCP_OAUTH_ISSUER: secret } as Env);
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(secret));
  const response = await handleEventMcp(new Request("https://example.com/mcp"), {
    MCP_PUBLIC_URL: "not-a-url", MCP_OAUTH_ISSUER: secret, MCP_OAUTH_JWKS_URL: secret, MCP_SUBJECT_MAP_JSON: "{}",
  } as Env);
  assert.equal(response.status, 503);
});
test("configuration checker validates branding, PKCE and issuer metadata offline", () => {
  const env = { MCP_PUBLIC_URL: "https://portal.example/mcp", MCP_OAUTH_ISSUER: "https://auth.example", MCP_OAUTH_JWKS_URL: "https://auth.example/jwks",
    MCP_SUBJECT_MAP_JSON: '{"subject":"pidp-user"}', EVENT_KEY_TEST: "test-only", EVENT_INTEGRATIONS_JSON: JSON.stringify({
      "org-one": { provider: "luma", calendarId: "cal-one", apiKeyBinding: "EVENT_KEY_TEST" },
    }) } as unknown as Env;
  const metadata = { issuer: env.MCP_OAUTH_ISSUER, jwks_uri: env.MCP_OAUTH_JWKS_URL, authorization_endpoint: "https://auth.example/authorize",
    token_endpoint: "https://auth.example/token", response_types_supported: ["code"], code_challenge_methods_supported: ["S256"], scopes_supported: ["org:events.read", "org:events.write"] };
  assert.equal(checkEventConfiguration(env, metadata).ok, true);
  assert.equal(checkEventConfiguration(env, { ...metadata, code_challenge_methods_supported: ["plain"] }).ok, false);
  assert.equal(checkEventConfiguration(env, { ...metadata, issuer: "https://other.example" }).ok, false);
});
