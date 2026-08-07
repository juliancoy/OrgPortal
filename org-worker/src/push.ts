import webpush from "web-push";

export type PushDeliveryJob = {
  eventId: string;
  userId?: string;
  subscriptionId?: string;
  title: string;
  body: string;
  deepLink: string;
};

export type PushSubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: number;
};

type MatrixNotification = {
  event_id?: string;
  room_id?: string;
  sender_display_name?: string;
  content?: { body?: string };
  devices?: Array<{ pushkey?: string }>;
};

const KEY_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

export function normalizeSubscription(input: PushSubscriptionInput) {
  const endpoint = String(input.endpoint || "").trim();
  const p256dh = String(input.keys?.p256dh || "").trim();
  const auth = String(input.keys?.auth || "").trim();
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("A valid push endpoint is required");
  }
  if (url.protocol !== "https:" || !p256dh || !auth || !KEY_PATTERN.test(p256dh) || !KEY_PATTERN.test(auth)) {
    throw new Error("A valid Web Push subscription is required");
  }
  return { endpoint: url.toString(), p256dh, auth };
}

export async function endpointHash(endpoint: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function matrixJobs(notification: MatrixNotification): { jobs: PushDeliveryJob[]; rejected: string[] } {
  const rejected: string[] = [];
  const jobs: PushDeliveryJob[] = [];
  const eventId = String(notification.event_id || "").trim();
  const roomId = String(notification.room_id || "").trim();
  const sender = String(notification.sender_display_name || "").trim();
  const body = String(notification.content?.body || "").trim();
  for (const device of notification.devices || []) {
    const subscriptionId = String(device.pushkey || "").trim();
    if (!subscriptionId || !eventId) {
      if (subscriptionId) rejected.push(subscriptionId);
      continue;
    }
    jobs.push({
      eventId: `matrix:${eventId}`,
      subscriptionId,
      title: sender || "New chat message",
      body: body || "You have a new message.",
      deepLink: roomId ? `/chat/${encodeURIComponent(roomId)}` : "/chat",
    });
  }
  return { jobs, rejected };
}

export async function enqueueUserPush(env: Env, job: PushDeliveryJob): Promise<void> {
  if (!env.PUSH_QUEUE) return;
  await env.PUSH_QUEUE.send(job);
}

async function deliverToSubscription(env: Env, job: PushDeliveryJob, subscription: PushSubscriptionRow): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO push_deliveries
     (id, event_id, subscription_id, status, attempts, created_at)
     VALUES (?, ?, ?, 'queued', 0, ?)`,
  ).bind(`push-${crypto.randomUUID()}`, job.eventId, subscription.id, now).run();

  const delivery = await env.DB.prepare(
    "SELECT status FROM push_deliveries WHERE event_id = ? AND subscription_id = ?",
  ).bind(job.eventId, subscription.id).first<{ status: string }>();
  if (delivery?.status === "sent") return;

  if (!env.VAPID_SUBJECT || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error("Web Push VAPID credentials are not configured");
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify({ title: job.title, body: job.body, url: job.deepLink, eventId: job.eventId }),
      { TTL: 60 * 60, urgency: "normal" },
    );
    await env.DB.prepare(
      "UPDATE push_deliveries SET status = 'sent', attempts = attempts + 1, last_error = NULL, sent_at = ? WHERE event_id = ? AND subscription_id = ?",
    ).bind(now, job.eventId, subscription.id).run();
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    const message = error instanceof Error ? error.message.slice(0, 500) : "Push delivery failed";
    await env.DB.prepare(
      "UPDATE push_deliveries SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE event_id = ? AND subscription_id = ?",
    ).bind(message, job.eventId, subscription.id).run();
    if (statusCode === 404 || statusCode === 410) {
      await env.DB.prepare("UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE id = ?")
        .bind(now, subscription.id).run();
      return;
    }
    throw error;
  }
}

export async function consumePushBatch(batch: MessageBatch<PushDeliveryJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      const job = message.body;
      const query = job.subscriptionId
        ? env.DB.prepare("SELECT * FROM push_subscriptions WHERE id = ? AND enabled = 1").bind(job.subscriptionId)
        : env.DB.prepare("SELECT * FROM push_subscriptions WHERE user_id = ? AND enabled = 1").bind(job.userId || "");
      const rows = await query.all<PushSubscriptionRow>();
      for (const subscription of rows.results || []) await deliverToSubscription(env, job, subscription);
      message.ack();
    } catch {
      message.retry({ delaySeconds: 30 });
    }
  }
}
