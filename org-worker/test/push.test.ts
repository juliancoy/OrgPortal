import assert from "node:assert/strict";
import test from "node:test";
import { matrixJobs, normalizeSubscription } from "../src/push";

test("normalizes standards-based Web Push subscriptions", () => {
  assert.deepEqual(normalizeSubscription({
    endpoint: "https://push.example.test/send/123",
    keys: { p256dh: "abc_DEF-123", auth: "auth_key" },
  }), {
    endpoint: "https://push.example.test/send/123",
    p256dh: "abc_DEF-123",
    auth: "auth_key",
  });
  assert.throws(() => normalizeSubscription({
    endpoint: "http://push.example.test/send/123",
    keys: { p256dh: "key", auth: "auth" },
  }), /valid Web Push subscription/);
});

test("converts Matrix notifications into subscription-specific delivery jobs", () => {
  const result = matrixJobs({
    event_id: "$event:matrix.example",
    room_id: "!room:matrix.example",
    sender_display_name: "Jordan",
    content: { body: "Hello there" },
    devices: [{ pushkey: "subscription-1" }, { pushkey: "subscription-2" }],
  });
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(result.jobs, [
    {
      eventId: "matrix:$event:matrix.example",
      subscriptionId: "subscription-1",
      title: "Jordan",
      body: "Hello there",
      deepLink: "/chat/!room%3Amatrix.example",
    },
    {
      eventId: "matrix:$event:matrix.example",
      subscriptionId: "subscription-2",
      title: "Jordan",
      body: "Hello there",
      deepLink: "/chat/!room%3Amatrix.example",
    },
  ]);
});
