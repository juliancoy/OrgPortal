import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../src/index";

type Row = Record<string, unknown>;

class FakeStmt {
  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeStmt(this.db, this.sql, params);
  }

  async first<T>() {
    return this.db.first<T>(this.sql, this.params);
  }

  async all<T>() {
    return { results: this.db.all<T>(this.sql, this.params) };
  }

  async run() {
    return this.db.run(this.sql, this.params);
  }
}

class FakeD1 {
  conversations: Row[] = [];
  members: Row[] = [];
  messages: Row[] = [];
  contacts: Row[] = [];
  receipts: Row[] = [];
  sequences = new Map<string, number>();

  prepare(sql: string) {
    return new FakeStmt(this, sql);
  }

  first<T>(sql: string, params: unknown[]): T | null {
    if (sql.includes("FROM user_contact_pages WHERE slug = ?")) {
      return (
        this.contacts.find(
          (row) => row.slug === params[0] && (row.enabled === 1 || (params[1] && row.user_id === params[1])),
        ) as T
      ) || null;
    }
    if (sql.includes("FROM chat_conversation_members") && sql.includes("state = 'active'")) {
      return (
        this.members.find((row) => row.conversation_id === params[0] && row.user_id === params[1] && row.state === "active") as T
      ) || null;
    }
    if (sql.includes("FROM chat_conversations WHERE id = ?")) {
      return (this.conversations.find((row) => row.id === params[0]) as T) || null;
    }
    if (sql.includes("FROM chat_conversations WHERE kind = 'dm' AND dm_key = ?")) {
      return (this.conversations.find((row) => row.kind === "dm" && row.dm_key === params[0]) as T) || null;
    }
    if (sql.includes("FROM chat_messages WHERE id = ?")) {
      return (this.messages.find((row) => row.id === params[0]) as T) || null;
    }
    if (sql.includes("FROM chat_messages WHERE sender_user_id = ? AND client_message_id = ?")) {
      return (this.messages.find((row) => row.sender_user_id === params[0] && row.client_message_id === params[1]) as T) || null;
    }
    if (sql.includes("COALESCE(MAX(sequence), 0) AS sequence")) {
      const max = this.messages
        .filter((row) => row.conversation_id === params[0])
        .reduce((value, row) => Math.max(value, Number(row.sequence || 0)), 0);
      return { sequence: max } as T;
    }
    if (sql.includes("RETURNING next_sequence - 1 AS sequence")) {
      const conversationId = String(params[0]);
      const next = this.sequences.get(conversationId) || 1;
      this.sequences.set(conversationId, next + 1);
      return { sequence: next } as T;
    }
    return null;
  }

  all<T>(sql: string, params: unknown[]): T[] {
    if (sql.includes("FROM chat_conversation_members m")) {
      const userId = params[1];
      return this.members
        .filter((member) => member.user_id === userId && member.state === "active")
        .map((member) => {
          const conversation = this.conversations.find((row) => row.id === member.conversation_id);
          const last = this.messages
            .filter((message) => message.conversation_id === member.conversation_id && !message.deleted_at)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
          const joined: Row = {
            ...conversation,
            last_message_body: last?.body || null,
            last_message_sender_user_id: last?.sender_user_id || null,
            last_message_created_at: last?.created_at || null,
            unread_count: 0,
          };
          return joined;
        })
        .filter((row) => row.id) as T[];
    }
    if (sql.includes("FROM chat_conversation_members WHERE conversation_id = ?")) {
      return this.members.filter((row) => row.conversation_id === params[0]) as T[];
    }
    if (sql.includes("FROM chat_messages")) {
      const conversationId = params[0];
      const afterSequence = Number(params[1] || 0);
      const after = params[2] ? String(params[2]) : null;
      const limit = Number(params[4] || params[2] || 50);
      return this.messages
        .filter((row) => row.conversation_id === conversationId && !row.deleted_at && row.moderation_state === "visible")
        .filter((row) => Number(row.sequence || 0) > afterSequence || (!row.sequence && after && String(row.created_at) > after))
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0) || String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0, limit) as T[];
    }
    if (sql.includes("FROM chat_message_receipts")) {
      return this.receipts.filter((row) => row.conversation_id === params[0]) as T[];
    }
    return [];
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO chat_conversations")) {
      this.conversations.push({
        id: params[0],
        kind: "dm",
        title: null,
        slug: null,
        dm_key: params[1],
        created_by_user_id: params[2],
        org_id: null,
        event_id: null,
        created_at: params[3],
        updated_at: params[4],
        last_message_at: null,
        archived_at: null,
      });
      this.sequences.set(String(params[0]), 1);
    }

    if (sql.includes("INSERT INTO chat_conversation_members")) {
      const conversationId = params[0];
      const userId = params[1];
      const existing = this.members.find((row) => row.conversation_id === conversationId && row.user_id === userId);
      if (existing) {
        existing.user_name = params[2] || existing.user_name;
        existing.state = "active";
      } else {
        this.members.push({
          conversation_id: conversationId,
          user_id: userId,
          user_name: params[2],
          role: params[3] === "owner" ? "owner" : "member",
          state: "active",
          joined_at: params[4] || params[3],
          last_read_message_id: null,
          last_read_at: null,
          muted_until: null,
        });
      }
    }

    if (sql.includes("INSERT INTO chat_messages")) {
      this.messages.push({
        id: params[0],
        conversation_id: params[1],
        sender_user_id: params[2],
        sender_name: params[3],
        client_message_id: params[4],
        body: params[5],
        sequence: params[6],
        message_type: "text",
        attachment_id: null,
        reply_to_message_id: params[7],
        thread_root_message_id: params[8],
        created_at: params[9],
        edited_at: null,
        deleted_at: null,
        moderation_state: "visible",
      });
    }

    if (sql.includes("INSERT INTO chat_conversation_sequences")) {
      const conversationId = String(params[0]);
      if (!this.sequences.has(conversationId)) this.sequences.set(conversationId, 1);
    }

    if (sql.includes("UPDATE chat_conversations SET updated_at = ?")) {
      const row = this.conversations.find((conversation) => conversation.id === params[2]);
      if (row) {
        row.updated_at = params[0];
        row.last_message_at = params[1];
      }
    }

    if (sql.includes("UPDATE chat_conversation_members")) {
      const row = this.members.find((member) => member.conversation_id === params[2] && member.user_id === params[3]);
      if (row) {
        row.last_read_message_id = params[0] || row.last_read_message_id;
        row.last_read_at = params[1];
      }
    }

    if (sql.includes("INSERT INTO chat_message_receipts")) {
      this.receipts.push({
        conversation_id: params[0],
        message_id: params[1],
        user_id: params[2],
        receipt_type: "read",
        created_at: params[3],
      });
    }

    return { success: true };
  }
}

function env(db = new FakeD1(), contactsDb = db): Env {
  return {
    DB: db as unknown as D1Database,
    CONTACTS_DB: contactsDb as unknown as D1Database,
    PIDP_BASE_URL: "https://id.example.test",
  };
}

function authedInit(body?: unknown): RequestInit {
  return {
    method: body ? "POST" : "GET",
    headers: {
      authorization: "Bearer valid-token",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  };
}

const originalFetch = globalThis.fetch;

test.before(() => {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://id.example.test/auth/me") {
      return Response.json({
        id: "user-a",
        email: "a@example.test",
        full_name: "Alice Example",
      });
    }
    return originalFetch(input);
  };
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("health route identifies the chat worker", async () => {
  const res = await app.request("https://chat.example.test/health", {}, env());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "chat-worker" });
});

test("protected chat routes require a bearer token", async () => {
  const res = await app.request("https://chat.example.test/api/network/chat/conversations", {}, env());
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { detail: "Authentication required" });
});

test("dm route resolves a contact slug and reuses the same conversation", async () => {
  const db = new FakeD1();
  db.contacts.push({
    user_id: "user-b",
    user_name: "Bob Example",
    slug: "bob-example",
    enabled: 1,
  });

  const first = await app.request(
    "https://chat.example.test/api/network/chat/dm",
    authedInit({ target_user_slug: "bob-example" }),
    env(db),
  );
  assert.equal(first.status, 201);
  const firstBody = (await first.json()) as { conversation: { id: string; members: Array<{ user_id: string }> } };
  assert.equal(firstBody.conversation.members.length, 2);
  assert.equal(db.conversations.length, 1);

  const second = await app.request(
    "https://chat.example.test/api/network/chat/dm",
    authedInit({ target_user_slug: "bob-example" }),
    env(db),
  );
  assert.equal(second.status, 200);
  assert.equal(db.conversations.length, 1);
});

test("dm route allows starting a direct message with yourself", async () => {
  const db = new FakeD1();
  db.contacts.push({
    user_id: "user-a",
    user_name: "Alice Example",
    slug: "alice-example",
    enabled: 0,
  });

  const first = await app.request(
    "https://chat.example.test/api/network/chat/dm",
    authedInit({ target_user_slug: "alice-example" }),
    env(db),
  );
  assert.equal(first.status, 201);
  const firstBody = (await first.json()) as { conversation: { id: string; members: Array<{ user_id: string; role: string }> } };
  assert.equal(firstBody.conversation.members.length, 1);
  assert.equal(firstBody.conversation.members[0].user_id, "user-a");
  assert.equal(firstBody.conversation.members[0].role, "owner");
  assert.equal(db.conversations.length, 1);
  assert.equal(db.conversations[0].dm_key, "user-a:user-a");

  const second = await app.request(
    "https://chat.example.test/api/network/chat/dm",
    authedInit({ target_user_slug: "alice-example" }),
    env(db),
  );
  assert.equal(second.status, 200);
  assert.equal(db.conversations.length, 1);
  assert.equal(db.members.length, 1);
});

test("messages require membership and persist for listed conversations", async () => {
  const db = new FakeD1();
  db.contacts.push({
    user_id: "user-b",
    user_name: "Bob Example",
    slug: "bob-example",
    enabled: 1,
  });

  const dm = await app.request(
    "https://chat.example.test/api/network/chat/dm",
    authedInit({ target_user_slug: "bob-example" }),
    env(db),
  );
  const { conversation } = (await dm.json()) as { conversation: { id: string } };

  const created = await app.request(
    `https://chat.example.test/api/network/chat/conversations/${conversation.id}/messages`,
    authedInit({ client_message_id: "client-message-1", body: "Hello from Cloudflare chat" }),
    env(db),
  );
  assert.equal(created.status, 201);
  const createdBody = (await created.json()) as { message: { body: string; client_message_id: string; sequence: number } };
  assert.equal(createdBody.message.body, "Hello from Cloudflare chat");
  assert.equal(createdBody.message.client_message_id, "client-message-1");
  assert.equal(createdBody.message.sequence, 1);

  const retried = await app.request(
    `https://chat.example.test/api/network/chat/conversations/${conversation.id}/messages`,
    authedInit({ client_message_id: "client-message-1", body: "Hello from Cloudflare chat" }),
    env(db),
  );
  assert.equal(retried.status, 200);
  const retriedBody = (await retried.json()) as { idempotent: boolean; message: { id: string; sequence: number } };
  assert.equal(retriedBody.idempotent, true);
  assert.equal(retriedBody.message.sequence, 1);
  assert.equal(db.messages.length, 1);

  const listed = await app.request(
    `https://chat.example.test/api/network/chat/conversations/${conversation.id}/messages?afterSequence=0`,
    authedInit(),
    env(db),
  );
  assert.equal(listed.status, 200);
  const listedBody = (await listed.json()) as { latest_sequence: number; messages: Array<{ body: string; sequence: number }> };
  assert.equal(listedBody.latest_sequence, 1);
  assert.equal(listedBody.messages.length, 1);
  assert.equal(listedBody.messages[0].body, "Hello from Cloudflare chat");
  assert.equal(listedBody.messages[0].sequence, 1);
});

test("sync returns only messages after the requested sequence", async () => {
  const db = new FakeD1();
  db.conversations.push({
    id: "conversation-1",
    kind: "dm",
    title: null,
    slug: null,
    dm_key: "user-a:user-b",
    created_by_user_id: "user-a",
    org_id: null,
    event_id: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
    last_message_at: null,
    archived_at: null,
  });
  db.members.push({
    conversation_id: "conversation-1",
    user_id: "user-a",
    user_name: "Alice Example",
    role: "owner",
    state: "active",
    joined_at: "2026-06-07T00:00:00.000Z",
    last_read_message_id: null,
    last_read_at: null,
    muted_until: null,
  });
  db.messages.push(
    {
      id: "message-1",
      conversation_id: "conversation-1",
      sender_user_id: "user-a",
      sender_name: "Alice Example",
      client_message_id: "client-message-1",
      body: "first",
      sequence: 1,
      message_type: "text",
      attachment_id: null,
      reply_to_message_id: null,
      thread_root_message_id: null,
      created_at: "2026-06-07T00:00:01.000Z",
      edited_at: null,
      deleted_at: null,
      moderation_state: "visible",
    },
    {
      id: "message-2",
      conversation_id: "conversation-1",
      sender_user_id: "user-a",
      sender_name: "Alice Example",
      client_message_id: "client-message-2",
      body: "second",
      sequence: 2,
      message_type: "text",
      attachment_id: null,
      reply_to_message_id: null,
      thread_root_message_id: null,
      created_at: "2026-06-07T00:00:02.000Z",
      edited_at: null,
      deleted_at: null,
      moderation_state: "visible",
    },
  );

  const res = await app.request(
    "https://chat.example.test/api/network/chat/conversations/conversation-1/sync?afterSequence=1",
    authedInit(),
    env(db),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { latest_sequence: number; messages: Array<{ body: string; sequence: number }> };
  assert.equal(body.latest_sequence, 2);
  assert.deepEqual(
    body.messages.map((message) => [message.body, message.sequence]),
    [["second", 2]],
  );
});

test("read receipts update membership state", async () => {
  const db = new FakeD1();
  db.conversations.push({
    id: "conversation-1",
    kind: "dm",
    title: null,
    slug: null,
    dm_key: "user-a:user-b",
    created_by_user_id: "user-a",
    org_id: null,
    event_id: null,
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
    last_message_at: null,
    archived_at: null,
  });
  db.members.push({
    conversation_id: "conversation-1",
    user_id: "user-a",
    user_name: "Alice Example",
    role: "owner",
    state: "active",
    joined_at: "2026-06-07T00:00:00.000Z",
    last_read_message_id: null,
    last_read_at: null,
    muted_until: null,
  });

  const res = await app.request(
    "https://chat.example.test/api/network/chat/conversations/conversation-1/read",
    authedInit({ message_id: "message-1" }),
    env(db),
  );
  assert.equal(res.status, 200);
  assert.equal(db.members[0].last_read_message_id, "message-1");
  assert.equal(db.receipts.length, 1);
});
