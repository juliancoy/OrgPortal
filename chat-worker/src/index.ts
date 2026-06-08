import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

type PidpUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  identity_data?: Record<string, unknown> | null;
};

type ContactUserRow = {
  user_id: string;
  user_name: string | null;
  slug: string;
  enabled: number;
};

type ConversationRow = {
  id: string;
  kind: string;
  title: string | null;
  slug: string | null;
  dm_key: string | null;
  created_by_user_id: string;
  org_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  archived_at: string | null;
  last_message_body?: string | null;
  last_message_sender_user_id?: string | null;
  last_message_created_at?: string | null;
  last_message_sequence?: number | null;
  unread_count?: number | null;
};

type MemberRow = {
  conversation_id: string;
  user_id: string;
  user_name: string | null;
  role: string;
  state: string;
  joined_at: string;
  last_read_message_id: string | null;
  last_read_at: string | null;
  muted_until: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_name: string | null;
  client_message_id: string | null;
  body: string;
  sequence: number | null;
  message_type: string;
  attachment_id: string | null;
  reply_to_message_id: string | null;
  thread_root_message_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  moderation_state: string;
};

type AppVariables = {
  user: PidpUser;
};

export const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function nowIso() {
  return new Date().toISOString();
}

function json(payload: unknown, status = 200, origin = "*") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    },
  });
}

function corsOrigin(env: Env, request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return "*";
  const allowed = (env.CHAT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (allowed.length === 0 || allowed.includes(origin)) return origin;
  return allowed[0] || "https://codecollective.us";
}

function fail(status: number, detail: string): never {
  const res = json({ detail }, status);
  throw new HTTPException(status as 400, { message: detail, res });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) return match[1].trim();

  const protocolToken = webSocketProtocolToken(request);
  if (protocolToken) return protocolToken;

  const url = new URL(request.url);
  const queryToken = cleanString(url.searchParams.get("access_token"), 4096);
  if (queryToken) return queryToken;

  fail(401, "Authentication required");
}

function userName(user: PidpUser) {
  return String(user.full_name || user.identity_data?.display_name || user.email || "User");
}

function cleanString(value: unknown, maxLength: number) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function cleanNullableString(value: unknown, maxLength: number) {
  const text = cleanString(value, maxLength);
  return text || null;
}

function cleanSlug(value: unknown) {
  return cleanString(value, 160)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dmKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

async function readJsonObject(request: Request) {
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function currentUser(env: Env, request: Request): Promise<PidpUser> {
  const base = (env.PIDP_BASE_URL || "https://id.codecollective.us").replace(/\/+$/g, "");
  const resp = await fetch(`${base}/auth/me`, {
    headers: { Authorization: `Bearer ${bearerToken(request)}` },
  });
  if (!resp.ok) fail(401, "Invalid credentials");
  const user = (await resp.json()) as PidpUser;
  if (!user.id) fail(401, "Invalid credentials");
  return user;
}

function webSocketProtocolToken(request: Request) {
  const protocols = (request.headers.get("sec-websocket-protocol") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const authProtocol = protocols.find((item) => item.startsWith("pidp."));
  if (!authProtocol) return "";
  try {
    const encoded = authProtocol.slice("pidp.".length);
    const padded = `${encoded}${"=".repeat((4 - (encoded.length % 4)) % 4)}`;
    const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    return atob(base64);
  } catch {
    return "";
  }
}

function selectedWebSocketProtocol(request: Request) {
  return (request.headers.get("sec-websocket-protocol") || "")
    .split(",")
    .map((item) => item.trim())
    .find((item) => item.startsWith("pidp."));
}

async function requireMember(db: D1Database, conversationId: string, userId: string) {
  const row = await db
    .prepare(
      `SELECT * FROM chat_conversation_members
       WHERE conversation_id = ? AND user_id = ? AND state = 'active'`,
    )
    .bind(conversationId, userId)
    .first<MemberRow>();
  if (!row) fail(403, "Conversation membership required");
  return row;
}

async function conversation(db: D1Database, conversationId: string) {
  const row = await db.prepare("SELECT * FROM chat_conversations WHERE id = ?").bind(conversationId).first<ConversationRow>();
  if (!row || row.archived_at) fail(404, "Conversation not found");
  return row;
}

async function resolveTargetUser(env: Env, payload: Record<string, unknown>) {
  const directUserId = cleanString(payload.target_user_id, 200);
  if (directUserId) {
    return {
      user_id: directUserId,
      user_name: cleanNullableString(payload.target_user_name, 200),
      slug: cleanSlug(payload.target_user_slug) || null,
    };
  }

  const slug = cleanSlug(payload.target_user_slug);
  if (!slug) fail(400, "target_user_id or target_user_slug is required");
  if (!env.CONTACTS_DB) fail(503, "Contact directory binding is not configured");

  const row = await env.CONTACTS_DB.prepare(
    "SELECT user_id, user_name, slug, enabled FROM user_contact_pages WHERE slug = ? AND enabled = 1",
  )
    .bind(slug)
    .first<ContactUserRow>();
  if (!row) fail(404, "Target user not found");
  return row;
}

function mapConversation(row: ConversationRow, members: MemberRow[] = []) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    org_id: row.org_id,
    event_id: row.event_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message_at: row.last_message_at,
  last_message: row.last_message_body
      ? {
          body: row.last_message_body,
          sender_user_id: row.last_message_sender_user_id,
          created_at: row.last_message_created_at,
          sequence: row.last_message_sequence || null,
        }
      : null,
    unread_count: row.unread_count || 0,
    members: members.map((member) => ({
      user_id: member.user_id,
      user_name: member.user_name,
      role: member.role,
      state: member.state,
      joined_at: member.joined_at,
      last_read_at: member.last_read_at,
    })),
  };
}

function mapMessage(row: MessageRow) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_user_id: row.sender_user_id,
    sender_name: row.sender_name,
    client_message_id: row.client_message_id,
    body: row.deleted_at ? "" : row.body,
    sequence: row.sequence,
    message_type: row.message_type,
    attachment_id: row.attachment_id,
    reply_to_message_id: row.reply_to_message_id,
    thread_root_message_id: row.thread_root_message_id,
    created_at: row.created_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    moderation_state: row.moderation_state,
  };
}

async function nextMessageSequence(db: D1Database, conversationId: string) {
  await db
    .prepare("INSERT INTO chat_conversation_sequences (conversation_id, next_sequence) VALUES (?, 1) ON CONFLICT(conversation_id) DO NOTHING")
    .bind(conversationId)
    .run();
  const row = await db
    .prepare(
      `UPDATE chat_conversation_sequences
       SET next_sequence = next_sequence + 1
       WHERE conversation_id = ?
       RETURNING next_sequence - 1 AS sequence`,
    )
    .bind(conversationId)
    .first<{ sequence: number }>();
  if (!row) fail(500, "Failed to allocate message sequence");
  return row.sequence;
}

async function latestSequence(db: D1Database, conversationId: string) {
  const row = await db
    .prepare("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM chat_messages WHERE conversation_id = ?")
    .bind(conversationId)
    .first<{ sequence: number }>();
  return row?.sequence || 0;
}

async function membersForConversation(db: D1Database, conversationId: string) {
  const rows = await db
    .prepare("SELECT * FROM chat_conversation_members WHERE conversation_id = ? ORDER BY joined_at ASC")
    .bind(conversationId)
    .all<MemberRow>();
  return rows.results || [];
}

async function broadcast(env: Env, conversationId: string, event: unknown) {
  if (!env.CHAT_ROOMS) return;
  const id = env.CHAT_ROOMS.idFromName(conversationId);
  const room = env.CHAT_ROOMS.get(id);
  await room.fetch("https://chat-room.local/broadcast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

app.use("*", async (c, next) => {
  await next();
  if (c.res.status === 101) return;
  const origin = corsOrigin(c.env, c.req.raw);
  c.res.headers.set("access-control-allow-origin", origin);
  c.res.headers.set("access-control-allow-headers", "authorization, content-type");
  c.res.headers.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  c.res.headers.set("vary", "Origin");
});

app.options("*", (c) => json({ ok: true }, 200, corsOrigin(c.env, c.req.raw)));

app.get("/health", (c) => c.json({ ok: true, service: "chat-worker" }));

app.use("/api/network/chat/*", async (c, next) => {
  const user = await currentUser(c.env, c.req.raw);
  c.set("user", user);
  await next();
});

app.get("/api/network/chat/conversations", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    `SELECT c.*,
       lm.body AS last_message_body,
       lm.sender_user_id AS last_message_sender_user_id,
       lm.created_at AS last_message_created_at,
       lm.sequence AS last_message_sequence,
       (
         SELECT COUNT(*)
         FROM chat_messages unread
         WHERE unread.conversation_id = c.id
           AND unread.deleted_at IS NULL
           AND unread.moderation_state = 'visible'
           AND unread.sender_user_id != ?
           AND (
             m.last_read_at IS NULL OR unread.created_at > m.last_read_at
           )
       ) AS unread_count
     FROM chat_conversation_members m
     JOIN chat_conversations c ON c.id = m.conversation_id
     LEFT JOIN chat_messages lm ON lm.id = (
       SELECT id FROM chat_messages
       WHERE conversation_id = c.id AND deleted_at IS NULL AND moderation_state = 'visible'
       ORDER BY sequence DESC, created_at DESC, id DESC
       LIMIT 1
     )
     WHERE m.user_id = ? AND m.state = 'active' AND c.archived_at IS NULL
     ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
     LIMIT 100`,
  )
    .bind(user.id, user.id)
    .all<ConversationRow>();

  return c.json({ conversations: (rows.results || []).map((row) => mapConversation(row)) });
});

app.post("/api/network/chat/dm", async (c) => {
  const user = c.get("user");
  const payload = await readJsonObject(c.req.raw);
  const target = await resolveTargetUser(c.env, payload);
  if (target.user_id === user.id) fail(400, "Cannot start a direct message with yourself");

  const key = dmKey(user.id, target.user_id);
  const existing = await c.env.DB.prepare("SELECT * FROM chat_conversations WHERE kind = 'dm' AND dm_key = ?")
    .bind(key)
    .first<ConversationRow>();

  const createdAt = nowIso();
  const conversationId = existing?.id || crypto.randomUUID();
  if (!existing) {
    await c.env.DB.prepare(
      `INSERT INTO chat_conversations
       (id, kind, title, slug, dm_key, created_by_user_id, created_at, updated_at)
       VALUES (?, 'dm', NULL, NULL, ?, ?, ?, ?)`,
    )
      .bind(conversationId, key, user.id, createdAt, createdAt)
      .run();
  }

  await c.env.DB.prepare(
    `INSERT INTO chat_conversation_members
     (conversation_id, user_id, user_name, role, state, joined_at)
     VALUES (?, ?, ?, ?, 'active', ?)
     ON CONFLICT(conversation_id, user_id) DO UPDATE SET
       user_name = excluded.user_name,
       state = 'active'`,
  )
    .bind(conversationId, user.id, userName(user), existing ? "member" : "owner", createdAt)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO chat_conversation_members
     (conversation_id, user_id, user_name, role, state, joined_at)
     VALUES (?, ?, ?, 'member', 'active', ?)
     ON CONFLICT(conversation_id, user_id) DO UPDATE SET
       user_name = COALESCE(excluded.user_name, chat_conversation_members.user_name),
       state = 'active'`,
  )
    .bind(conversationId, target.user_id, target.user_name || null, createdAt)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM chat_conversations WHERE id = ?")
    .bind(conversationId)
    .first<ConversationRow>();
  return c.json({ conversation: mapConversation(row!, await membersForConversation(c.env.DB, conversationId)) }, existing ? 200 : 201);
});

app.get("/api/network/chat/conversations/:conversationId", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");
  await requireMember(c.env.DB, conversationId, user.id);
  const row = await conversation(c.env.DB, conversationId);
  return c.json({ conversation: mapConversation(row, await membersForConversation(c.env.DB, conversationId)) });
});

app.get("/api/network/chat/conversations/:conversationId/messages", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");
  await requireMember(c.env.DB, conversationId, user.id);

  const limit = Math.min(Math.max(Number(c.req.query("limit") || 50), 1), 100);
  const afterSequence = Math.max(Number(c.req.query("afterSequence") || c.req.query("after_sequence") || 0), 0);
  const after = cleanNullableString(c.req.query("after"), 80);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM chat_messages
     WHERE conversation_id = ?
       AND deleted_at IS NULL
       AND moderation_state = 'visible'
       AND (
         sequence > ?
         OR (? IS NOT NULL AND sequence IS NULL AND created_at > ?)
       )
     ORDER BY COALESCE(sequence, 0) ASC, created_at ASC, id ASC
     LIMIT ?`,
  )
    .bind(conversationId, afterSequence, after, after, limit)
    .all<MessageRow>();

  return c.json({ messages: (rows.results || []).map(mapMessage), latest_sequence: await latestSequence(c.env.DB, conversationId) });
});

app.get("/api/network/chat/conversations/:conversationId/sync", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");
  await requireMember(c.env.DB, conversationId, user.id);
  const afterSequence = Math.max(Number(c.req.query("afterSequence") || c.req.query("after_sequence") || 0), 0);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 100), 1), 250);

  const [messageRows, receiptRows, memberRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM chat_messages
       WHERE conversation_id = ?
         AND deleted_at IS NULL
         AND moderation_state = 'visible'
         AND sequence > ?
       ORDER BY sequence ASC
       LIMIT ?`,
    )
      .bind(conversationId, afterSequence, limit)
      .all<MessageRow>(),
    c.env.DB.prepare(
      `SELECT conversation_id, message_id, user_id, receipt_type, created_at
       FROM chat_message_receipts
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT 500`,
    )
      .bind(conversationId)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM chat_conversation_members WHERE conversation_id = ? ORDER BY joined_at ASC")
      .bind(conversationId)
      .all<MemberRow>(),
  ]);

  return c.json({
    conversation_id: conversationId,
    latest_sequence: await latestSequence(c.env.DB, conversationId),
    messages: (messageRows.results || []).map(mapMessage),
    receipts: receiptRows.results || [],
    members: (memberRows.results || []).map((member) => ({
      user_id: member.user_id,
      user_name: member.user_name,
      role: member.role,
      state: member.state,
      last_read_message_id: member.last_read_message_id,
      last_read_at: member.last_read_at,
    })),
  });
});

app.post("/api/network/chat/conversations/:conversationId/messages", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");
  await requireMember(c.env.DB, conversationId, user.id);
  await conversation(c.env.DB, conversationId);

  const payload = await readJsonObject(c.req.raw);
  const body = cleanString(payload.body, 4000);
  if (!body) fail(400, "Message body is required");
  const clientMessageId = cleanString(payload.client_message_id || payload.clientMessageId, 160) || crypto.randomUUID();

  const existing = await c.env.DB.prepare(
    "SELECT * FROM chat_messages WHERE sender_user_id = ? AND client_message_id = ?",
  )
    .bind(user.id, clientMessageId)
    .first<MessageRow>();
  if (existing) {
    if (existing.conversation_id !== conversationId) fail(409, "client_message_id was already used in another conversation");
    return c.json({ message: mapMessage(existing), idempotent: true }, 200);
  }

  const createdAt = nowIso();
  const messageId = crypto.randomUUID();
  const sequence = await nextMessageSequence(c.env.DB, conversationId);
  await c.env.DB.prepare(
    `INSERT INTO chat_messages
     (id, conversation_id, sender_user_id, sender_name, client_message_id, body, sequence, message_type, reply_to_message_id,
      thread_root_message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'text', ?, ?, ?)`,
  )
    .bind(
      messageId,
      conversationId,
      user.id,
      userName(user),
      clientMessageId,
      body,
      sequence,
      cleanNullableString(payload.reply_to_message_id, 120),
      cleanNullableString(payload.thread_root_message_id, 120),
      createdAt,
    )
    .run();

  await c.env.DB.prepare("UPDATE chat_conversations SET updated_at = ?, last_message_at = ? WHERE id = ?")
    .bind(createdAt, createdAt, conversationId)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM chat_messages WHERE id = ?").bind(messageId).first<MessageRow>();
  const message = mapMessage(row!);
  await broadcast(c.env, conversationId, { type: "message.created", conversation_id: conversationId, sequence, message });
  return c.json({ message }, 201);
});

app.post("/api/network/chat/conversations/:conversationId/read", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");
  await requireMember(c.env.DB, conversationId, user.id);
  const payload = await readJsonObject(c.req.raw);
  const messageId = cleanNullableString(payload.message_id, 120);
  const readAt = nowIso();

  await c.env.DB.prepare(
    `UPDATE chat_conversation_members
     SET last_read_message_id = COALESCE(?, last_read_message_id), last_read_at = ?
     WHERE conversation_id = ? AND user_id = ?`,
  )
    .bind(messageId, readAt, conversationId, user.id)
    .run();

  if (messageId) {
    await c.env.DB.prepare(
      `INSERT INTO chat_message_receipts
       (conversation_id, message_id, user_id, receipt_type, created_at)
       VALUES (?, ?, ?, 'read', ?)
       ON CONFLICT(conversation_id, message_id, user_id, receipt_type) DO UPDATE SET
        created_at = excluded.created_at`,
    )
      .bind(conversationId, messageId, user.id, readAt)
      .run();
  }

  await broadcast(c.env, conversationId, {
    type: "conversation.read",
    conversation_id: conversationId,
    user_id: user.id,
    message_id: messageId,
    read_at: readAt,
  });
  return c.json({ ok: true, read_at: readAt });
});

app.get("/api/network/chat/conversations/:conversationId/socket", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("conversationId");
  await requireMember(c.env.DB, conversationId, user.id);
  if (!c.env.CHAT_ROOMS) fail(503, "Realtime chat is not configured");

  const id = c.env.CHAT_ROOMS.idFromName(conversationId);
  const room = c.env.CHAT_ROOMS.get(id);
  const url = new URL("https://chat-room.local/socket");
  url.searchParams.set("conversation_id", conversationId);
  url.searchParams.set("user_id", user.id);
  url.searchParams.set("user_name", userName(user));
  return room.fetch(url, c.req.raw);
});

type ConnectedSocket = {
  userId: string;
  userName: string;
  conversationId: string;
  connectedAt: string;
};

export class ConversationDurableObject {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const event = await request.json();
      this.broadcast(event);
      return json({ ok: true });
    }

    if (url.pathname === "/socket") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return json({ detail: "WebSocket upgrade required" }, 426);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const connected: ConnectedSocket = {
        userId: cleanString(url.searchParams.get("user_id"), 200),
        userName: cleanString(url.searchParams.get("user_name"), 200) || "User",
        conversationId: cleanString(url.searchParams.get("conversation_id"), 200),
        connectedAt: nowIso(),
      };
      server.serializeAttachment(connected);
      this.state.acceptWebSocket(server, [`conversation:${connected.conversationId}`, `user:${connected.userId}`]);
      server.send(JSON.stringify({ type: "connected", at: nowIso() }));
      const selectedProtocol = selectedWebSocketProtocol(request);
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: selectedProtocol ? { "sec-websocket-protocol": selectedProtocol } : undefined,
      });
    }

    return json({ detail: "Not found" }, 404);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const connected = socketAttachment(ws);
    if (!connected) {
      ws.send(JSON.stringify({ type: "error", detail: "Missing socket metadata" }));
      return;
    }
    const text = typeof message === "string" ? message : "";
    if (!text) return;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", at: nowIso() }));
        return;
      }
      if (parsed.type === "typing") {
        this.broadcast({
          type: "typing",
          conversation_id: connected.conversationId,
          user_id: connected.userId,
          user_name: connected.userName,
          active: Boolean(parsed.active),
          at: nowIso(),
        });
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", detail: "Invalid WebSocket message" }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    ws.serializeAttachment(null);
  }

  async webSocketError(ws: WebSocket) {
    ws.serializeAttachment(null);
  }

  private broadcast(event: unknown) {
    const data = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(data);
      } catch {
        try {
          socket.close(1011, "Broadcast failed");
        } catch {
          // Socket is already unusable.
        }
      }
    }
  }
}

function socketAttachment(ws: WebSocket): ConnectedSocket | null {
  const attachment = ws.deserializeAttachment();
  if (!attachment || typeof attachment !== "object") return null;
  const data = attachment as Partial<ConnectedSocket>;
  if (!data.userId || !data.conversationId) return null;
  return {
    userId: data.userId,
    userName: data.userName || "User",
    conversationId: data.conversationId,
    connectedAt: data.connectedAt || nowIso(),
  };
}

export default app;
