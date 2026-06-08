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
  organizations: Row[] = [];
  events: Row[] = [];
  contacts: Row[] = [];
  motions: Row[] = [];
  governanceVotes: Row[] = [];
  engagementVotes: Row[] = [];

  prepare(sql: string) {
    return new FakeStmt(this, sql);
  }

  first<T>(sql: string, params: unknown[]): T | null {
    if (sql.includes("FROM organizations WHERE source_url = ?")) {
      return (this.organizations.find((row) => row.source_url === params[0]) as T) || null;
    }
    if (sql.includes("FROM organizations WHERE source_url IS NULL")) {
      const [name, city] = params.map((value) => String(value).toLowerCase());
      return (
        this.organizations.find(
          (row) => !row.source_url && String(row.name).toLowerCase() === name && String(row.city).toLowerCase() === city,
        ) as T
      ) || null;
    }
    if (sql.includes("FROM organizations WHERE id = ?")) {
      return (this.organizations.find((row) => row.id === params[0]) as T) || null;
    }
    if (sql.includes("FROM organizations WHERE slug = ?")) {
      return (this.organizations.find((row) => row.slug === params[0]) as T) || null;
    }
    if (sql.includes("FROM events WHERE ingest_key = ?")) {
      return (this.events.find((row) => row.ingest_key === params[0]) as T) || null;
    }
    if (sql.includes("count(*) AS n FROM events WHERE host_org_id = ?")) {
      return { n: this.events.filter((row) => row.host_org_id === params[0]).length } as T;
    }
    if (sql.includes("FROM events e") && sql.includes("WHERE e.slug = ?")) {
      const event = this.events.find((row) => row.slug === params[0]);
      if (!event) return null;
      const org = this.organizations.find((row) => row.id === event.host_org_id);
      return { ...event, organization_name: org?.name || null } as T;
    }
    if (sql.includes("FROM governance_motions WHERE id = ?")) {
      return (this.motions.find((row) => row.id === params[0]) as T) || null;
    }
    if (sql.includes("FROM governance_engagement_votes") && sql.includes("AS up")) {
      const motionId = params[0];
      const votes = this.engagementVotes.filter((row) => row.motion_id === motionId);
      const up = votes.filter((row) => row.direction === "up").length;
      const down = votes.filter((row) => row.direction === "down").length;
      return { up, down, score: up - down } as T;
    }
    if (sql.includes("FROM governance_engagement_votes") && sql.includes("AS score")) {
      const motionId = params[0];
      return {
        score: this.engagementVotes
          .filter((row) => row.motion_id === motionId)
          .reduce((score, row) => score + (row.direction === "up" ? 1 : row.direction === "down" ? -1 : 0), 0),
      } as T;
    }
    if (sql.includes("FROM user_contact_pages WHERE slug = ? AND enabled = 1")) {
      return (this.contacts.find((row) => row.slug === params[0] && row.enabled === 1) as T) || null;
    }
    return null;
  }

  all<T>(sql: string, params: unknown[]): T[] {
    if (sql.includes("SELECT id, slug FROM organizations")) {
      const [lower, upper] = params.map(String);
      return this.organizations.filter((row) => String(row.slug) >= lower && String(row.slug) < upper) as T[];
    }
    if (sql.includes("SELECT id, slug FROM events")) {
      const [lower, upper] = params.map(String);
      return this.events.filter((row) => String(row.slug) >= lower && String(row.slug) < upper) as T[];
    }
    if (sql.includes("FROM organizations o")) {
      return this.organizations.map((row) => ({
        ...row,
        upcoming_events_count: this.events.filter((event) => event.host_org_id === row.id).length,
      })) as T[];
    }
    if (sql.includes("FROM events e")) {
      const hostOrgId = sql.includes("WHERE e.host_org_id = ?") ? params[0] : null;
      return this.events
        .filter((event) => !hostOrgId || event.host_org_id === hostOrgId)
        .map((event) => ({
          ...event,
          organization_name: this.organizations.find((org) => org.id === event.host_org_id)?.name || null,
        })) as T[];
    }
    if (sql.includes("FROM governance_motions m")) {
      return this.motions.map((motion) => ({
        ...motion,
        score: this.engagementVotes
          .filter((row) => row.motion_id === motion.id)
          .reduce((score, row) => score + (row.direction === "up" ? 1 : row.direction === "down" ? -1 : 0), 0),
      })) as T[];
    }
    if (sql.includes("FROM governance_votes WHERE motion_id = ?")) {
      return this.governanceVotes.filter((row) => row.motion_id === params[0]) as T[];
    }
    return [];
  }

  async run(sql: string, params: unknown[]) {
    const now = "2026-06-07T00:00:00.000Z";
    if (sql.includes("INSERT INTO organizations")) {
      const row: Row = {
        id: params[0],
        name: params[1],
        slug: params[2],
        description: params[3],
        source_url: params[4],
        image_url: params[5],
        tags: params[6],
        city: params[7],
        created_at: params[8] || now,
        updated_at: params[9] || now,
      };
      const existingIndex = this.organizations.findIndex((item) => item.id === row.id);
      if (existingIndex >= 0) this.organizations[existingIndex] = { ...this.organizations[existingIndex], ...row };
      else this.organizations.push(row);
    }
    if (sql.includes("INSERT INTO events")) {
      const row: Row = {
        id: params[0],
        ingest_key: params[1],
        title: params[2],
        slug: params[3],
        description: params[4],
        starts_at: params[5],
        ends_at: params[6],
        location: params[7],
        source_url: params[8],
        image_url: params[9],
        host_org_id: params[10],
        host_org_name: params[11],
        host_org_source_url: params[12],
        tags: params[13],
        city: params[14],
        created_at: params[15] || now,
        updated_at: params[16] || now,
      };
      const existingIndex = this.events.findIndex((item) => item.ingest_key === row.ingest_key);
      if (existingIndex >= 0) this.events[existingIndex] = { ...this.events[existingIndex], ...row };
      else this.events.push(row);
    }
    return { success: true };
  }
}

function env(db = new FakeD1()): Env {
  return {
    DB: db as unknown as D1Database,
    PIDP_BASE_URL: "https://id.example.test",
    PUBLIC_PORTAL_BASE_URL: "https://codecollective.test/p",
    ORG_INGEST_TOKEN: "test-ingest-token",
  };
}

test("health route identifies the org worker", async () => {
  const res = await app.request("https://org.example.test/health", {}, env());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "org-worker" });
});

test("protected contact route requires a bearer token", async () => {
  const res = await app.request("https://org.example.test/api/network/contact/me", {}, env());
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { detail: "Authentication required" });
});

test("public contact routes return sanitized canonical user URLs for exact slugs", async () => {
  const db = new FakeD1();
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "julian@example.test",
    user_name: "Julian Coy",
    slug: "julian-coy",
    enabled: 1,
    headline: "Organizer",
    bio: null,
    photo_url: null,
    email_public: "julian@example.test",
    phone_public: null,
    linkedin_url: "https://www.linkedin.com/in/julian-coy-a2906415/",
    github_url: "https://github.com/juliancoy",
    x_url: null,
    website_url: "https://juliancoy.us/",
    links: JSON.stringify([{ label: "Site", url: "https://juliancoy.us/" }]),
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const res = await app.request("https://org.example.test/api/network/users/public/julian-coy", {}, env(db));
  assert.equal(res.status, 200);
  const contact = (await res.json()) as { slug: string; public_url: string };
  assert.equal(contact.slug, "julian-coy");
  assert.equal(contact.public_url, "https://codecollective.test/p/users/julian-coy");
});

test("public contact route does not numerically fallback from missing slugs", async () => {
  const db = new FakeD1();
  db.contacts.push({
    id: "contact-1",
    user_id: "user-1",
    user_email: "julian@example.test",
    user_name: "Julian Coy",
    slug: "julian-coy",
    enabled: 1,
    headline: "Organizer",
    bio: null,
    photo_url: null,
    email_public: "julian@example.test",
    phone_public: null,
    linkedin_url: null,
    github_url: null,
    x_url: null,
    website_url: null,
    links: "[]",
    source_profile_url: null,
    source_profile_imported_at: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const res = await app.request("https://org.example.test/api/network/users/public/julian-coy-2", {}, env(db));
  assert.equal(res.status, 404);
});

test("public org and event routes return D1 rows", async () => {
  const db = new FakeD1();
  db.organizations.push({
    id: "org-1",
    name: "Code Collective",
    slug: "code-collective",
    description: "Civic tech",
    source_url: "https://codecollective.test",
    image_url: null,
    tags: JSON.stringify(["Civic"]),
    city: "baltimore",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });
  db.events.push({
    id: "event-1",
    ingest_key: "event-key",
    title: "Open Meeting",
    slug: "open-meeting",
    description: "Public meeting",
    starts_at: "2026-06-08T12:00:00Z",
    ends_at: null,
    location: "Baltimore",
    source_url: "https://codecollective.test/events/open-meeting",
    image_url: null,
    host_org_id: "org-1",
    host_org_name: "Code Collective",
    host_org_source_url: "https://codecollective.test",
    tags: JSON.stringify(["Civic"]),
    city: "baltimore",
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
  });

  const orgList = await app.request("https://org.example.test/api/network/orgs/public", {}, env(db));
  assert.equal(orgList.status, 200);
  const orgs = (await orgList.json()) as Array<{ slug: string; upcoming_events_count: number }>;
  assert.equal(orgs[0].slug, "code-collective");
  assert.equal(orgs[0].upcoming_events_count, 1);

  const eventDetail = await app.request("https://org.example.test/api/network/events/public/open-meeting", {}, env(db));
  assert.equal(eventDetail.status, 200);
  const event = (await eventDetail.json()) as { title: string; organization_name: string };
  assert.equal(event.title, "Open Meeting");
  assert.equal(event.organization_name, "Code Collective");
});

test("calendar ingest requires the configured token", async () => {
  const res = await app.request(
    "https://org.example.test/api/network/ingest/calendar",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizations: [], events: [] }),
    },
    env(),
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { detail: "Authentication required" });
});

test("calendar ingest upserts orgs and events", async () => {
  const db = new FakeD1();
  const payload = {
    organizations: [
      {
        name: "Backwater Books Events",
        source_url: "https://backwaterbooks.com/events",
        image_url: "/event_images/backwater.webp",
        tags: ["Books", "city:dc"],
        description: "Calendar source",
        city: "dc",
      },
    ],
    events: [
      {
        ingest_key: "event-key-1",
        title: "Backwater Sessions",
        description: "Reading",
        starts_at: "2026-06-08T00:00:00+00:00",
        location: "DC",
        source_url: "https://backwaterbooks.com/event",
        image_url: "/event_images/session.webp",
        host_org_source_url: "https://backwaterbooks.com/events",
        host_org_name: "Backwater Books Events",
        tags: ["Books"],
        city: "dc",
      },
    ],
  };
  const res = await app.request(
    "https://org.example.test/api/network/ingest/calendar",
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-ingest-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    env(db),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, organizations: 1, events: 1 });
  assert.equal(db.organizations.length, 1);
  assert.equal(db.events.length, 1);
  assert.equal(db.organizations[0].image_url, "https://codecollective.us/event_images/backwater.webp");
  assert.equal(db.events[0].host_org_id, db.organizations[0].id);
  assert.equal(db.events[0].image_url, "https://codecollective.us/event_images/session.webp");
});

test("governance routes return D1 motions and engagement counts", async () => {
  const db = new FakeD1();
  db.motions.push({
    id: "mot-test",
    type: "main",
    parent_motion_id: null,
    title: "Test Motion",
    body: "Move to test the Worker governance API.",
    proposed_body_diff: null,
    status: "discussion",
    proposer_type: "user",
    proposer_id: "user-1",
    proposer_name: "Test User",
    proposer_user_name: null,
    proposer_org_id: null,
    proposer_org_name: null,
    seconder_id: null,
    seconder_name: null,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
    discussion_deadline: null,
    voting_deadline: null,
    quorum_required: 5,
    result: null,
  });
  db.engagementVotes.push(
    { motion_id: "mot-test", user_id: "user-1", direction: "up" },
    { motion_id: "mot-test", user_id: "user-2", direction: "down" },
    { motion_id: "mot-test", user_id: "user-3", direction: "up" },
  );

  const list = await app.request("https://org.example.test/api/governance/motions", {}, env(db));
  assert.equal(list.status, 200);
  const motions = (await list.json()) as Array<{ id: string; title: string; score: number }>;
  assert.equal(motions.length, 1);
  assert.equal(motions[0].id, "mot-test");
  assert.equal(motions[0].score, 1);

  const counts = await app.request("https://org.example.test/api/governance/motions/mot-test/vote-counts", {}, env(db));
  assert.equal(counts.status, 200);
  assert.deepEqual(await counts.json(), { up: 2, down: 1, score: 1 });
});
