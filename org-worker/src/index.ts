import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

type ContactLink = {
  label: string;
  url: string;
};

type PidpUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  identity_data?: Record<string, unknown> | null;
  is_admin?: boolean;
  is_sysadmin?: boolean;
};

type ContactRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  slug: string;
  enabled: number;
  headline: string | null;
  bio: string | null;
  photo_url: string | null;
  email_public: string | null;
  phone_public: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  x_url: string | null;
  website_url: string | null;
  links: string;
  source_profile_url: string | null;
  source_profile_imported_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConnectionStatus = "none" | "pending_sent" | "pending_received" | "connected" | "declined";

type ConnectionRow = {
  id: string;
  pair_key: string;
  requester_user_id: string;
  requester_user_name: string | null;
  recipient_user_id: string;
  recipient_user_name: string | null;
  status: "pending" | "accepted" | "declined" | "canceled";
  requested_at: string;
  responded_at: string | null;
  updated_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  actor_user_id: string | null;
  actor_user_name: string | null;
  entity_id: string | null;
  title: string;
  body: string | null;
  status: "unread" | "read";
  created_at: string;
  read_at: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  source_url: string | null;
  image_url: string | null;
  tags: string;
  city: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  ingest_key: string;
  title: string;
  slug: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  source_url: string | null;
  image_url: string | null;
  host_org_id: string | null;
  host_org_name: string | null;
  host_org_source_url: string | null;
  tags: string;
  city: string | null;
  created_at: string;
  updated_at: string;
  organization_name?: string | null;
};

type GovernanceMotionRow = {
  id: string;
  type: string;
  parent_motion_id: string | null;
  title: string;
  body: string;
  proposed_body_diff: string | null;
  status: string;
  proposer_type: string;
  proposer_id: string;
  proposer_name: string;
  proposer_user_name: string | null;
  proposer_org_id: string | null;
  proposer_org_name: string | null;
  seconder_id: string | null;
  seconder_name: string | null;
  created_at: string;
  updated_at: string;
  discussion_deadline: string | null;
  voting_deadline: string | null;
  quorum_required: number;
  result: string | null;
  score?: number | null;
};

type GovernanceVoteRow = {
  id: string;
  motion_id: string;
  user_id: string;
  user_name: string;
  choice: string;
  cast_at: string;
};

type GovernanceCommentRow = {
  id: string;
  motion_id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type LedgerAccountRow = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  entity_type: string;
  balance: number;
  dena_balance?: number | null;
  created_at: string;
  updated_at: string;
};

type LedgerTransactionRow = {
  id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number;
  currency: string;
  transaction_type: string;
  description: string;
  timestamp: string;
  from_account_name?: string | null;
  to_account_name?: string | null;
};

type UbiSettingsRow = {
  interval_seconds: number;
  dena_annual: number;
  dena_precision: number;
  entity_types: string;
  updated_at: string;
  updated_by: string | null;
};

const DEFAULT_UBI_CADENCE_SECONDS = 14 * 24 * 60 * 60;

type UbiTickSummary = {
  run_key: string;
  status: "skipped" | "completed";
  started_at: string;
  completed_at: string;
  elapsed_seconds: number;
  eligible_accounts: number;
  payout_count: number;
  accrued_amount: number;
  paid_amount: number;
};

type CalendarIngestPayload = {
  organizations?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
};

type ContactPayload = Partial<{
  enabled: boolean;
  slug: string | null;
  headline: string | null;
  bio: string | null;
  photo_url: string | null;
  email_public: string | null;
  phone_public: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  x_url: string | null;
  website_url: string | null;
  links: ContactLink[];
}>;

const DEFAULT_ADMIN_EMAIL = "julian@codecollective.us";

export const app = new Hono<{ Bindings: Env; Variables: { user: PidpUser } }>();

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function fail(status: number, detail: string): never {
  const res = new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
  throw new HTTPException(status as 400, { message: detail, res });
}

function nowIso() {
  return new Date().toISOString();
}

function isoFromMillis(value: number) {
  return new Date(value).toISOString();
}

function parseList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseLinks(value: string | null | undefined): ContactLink[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const label = String(record.label || "").trim();
        const url = String(record.url || "").trim();
        return label && url ? { label, url } : null;
      })
      .filter((item): item is ContactLink => Boolean(item));
  } catch {
    return [];
  }
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function adminUser(user: PidpUser, env: Env) {
  const adminEmails = parseList(env.ADMIN_EMAILS);
  const adminIds = parseList(env.ADMIN_USER_IDS);
  const identity = user.identity_data || {};
  const roles = Array.isArray(identity.roles)
    ? identity.roles.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [];
  return (
    Boolean(user.is_sysadmin) ||
    Boolean(user.is_admin) ||
    identity.is_sysadmin === true ||
    identity.is_admin === true ||
    roles.includes("sysadmin") ||
    roles.includes("admin") ||
    roles.includes("cis_admin") ||
    roles.includes("cis-admin") ||
    adminIds.includes(user.id.toLowerCase()) ||
    (user.email ? adminEmails.includes(user.email.toLowerCase()) : false)
  );
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "contact";
}

function connectionPairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

function mapConnection(row: ConnectionRow, currentUserId: string) {
  const otherUserId = row.requester_user_id === currentUserId ? row.recipient_user_id : row.requester_user_id;
  const otherUserName = row.requester_user_id === currentUserId ? row.recipient_user_name : row.requester_user_name;
  const direction =
    row.status === "pending"
      ? row.requester_user_id === currentUserId
        ? "outgoing"
        : "incoming"
      : null;
  return {
    id: row.id,
    status: row.status,
    direction,
    other_user_id: otherUserId,
    other_user_name: otherUserName || "User",
    requested_at: row.requested_at,
    responded_at: row.responded_at,
    updated_at: row.updated_at,
  };
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    actor_user_id: row.actor_user_id,
    actor_user_name: row.actor_user_name,
    entity_id: row.entity_id,
    title: row.title,
    body: row.body,
    status: row.status,
    created_at: row.created_at,
    read_at: row.read_at,
  };
}

async function contactByUserId(db: D1Database, userId: string) {
  return db.prepare("SELECT * FROM user_contact_pages WHERE user_id = ?").bind(userId).first<ContactRow>();
}

async function connectionStatusMap(db: D1Database, currentUserId: string, targetUserIds: string[]) {
  const uniqueTargets = [...new Set(targetUserIds.filter((id) => id && id !== currentUserId))];
  if (!uniqueTargets.length) return new Map<string, ConnectionStatus>();
  const placeholders = uniqueTargets.map(() => "?").join(", ");
  const rows = await db.prepare(
    `SELECT * FROM user_connections
     WHERE (requester_user_id = ? AND recipient_user_id IN (${placeholders}))
        OR (recipient_user_id = ? AND requester_user_id IN (${placeholders}))`,
  )
    .bind(currentUserId, ...uniqueTargets, currentUserId, ...uniqueTargets)
    .all<ConnectionRow>();
  const statuses = new Map<string, ConnectionStatus>();
  for (const row of rows.results || []) {
    const other = row.requester_user_id === currentUserId ? row.recipient_user_id : row.requester_user_id;
    if (row.status === "accepted") statuses.set(other, "connected");
    else if (row.status === "pending") statuses.set(other, row.requester_user_id === currentUserId ? "pending_sent" : "pending_received");
    else if (row.status === "declined") statuses.set(other, "declined");
  }
  return statuses;
}

async function ensureDefaultAdminConnection(db: D1Database, contact: ContactRow) {
  const admin = await db.prepare("SELECT * FROM user_contact_pages WHERE lower(user_email) = ?")
    .bind(DEFAULT_ADMIN_EMAIL)
    .first<ContactRow>();
  if (!admin || admin.user_id === contact.user_id) return;

  const pairKey = connectionPairKey(admin.user_id, contact.user_id);
  const existing = await db.prepare("SELECT id FROM user_connections WHERE pair_key = ?")
    .bind(pairKey)
    .first<{ id: string }>();
  if (existing) return;

  const now = nowIso();
  await db.prepare(
    `INSERT INTO user_connections
     (id, pair_key, requester_user_id, requester_user_name, recipient_user_id, recipient_user_name, status, requested_at, responded_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?)`,
  )
    .bind(
      `conn-admin-${crypto.randomUUID()}`,
      pairKey,
      admin.user_id,
      admin.user_name || "Julian Coy II",
      contact.user_id,
      contact.user_name || "User",
      now,
      now,
      now,
    )
    .run();
}

function publicPortalBase(env: Env, request: Request) {
  const configured = (env.PUBLIC_PORTAL_BASE_URL || "").replace(/\/+$/g, "");
  if (configured) return configured;
  return `${new URL(request.url).origin}/p`;
}

function publicUrl(env: Env, request: Request, slug: string) {
  return `${publicPortalBase(env, request)}/users/${encodeURIComponent(slug)}`;
}

function orgPublicUrl(env: Env, request: Request, slug: string) {
  return `${publicPortalBase(env, request).replace(/\/+$/g, "")}/orgs/${encodeURIComponent(slug)}`;
}

function eventPublicUrl(env: Env, request: Request, slug: string) {
  return `${publicPortalBase(env, request).replace(/\/+$/g, "")}/events/${encodeURIComponent(slug)}`;
}

function userName(user: PidpUser) {
  return String(user.full_name || user.identity_data?.display_name || user.email || "User");
}

function userProfileImage(user: PidpUser): string | null {
  return cleanUrl(user.identity_data?.avatar_url || user.avatar_url || null);
}

function defaultSlug(user: PidpUser) {
  const name = userName(user);
  if (name && name !== "User") return slugify(name);
  if (user.email && user.email.includes("@")) return slugify(user.email.split("@")[0]);
  return slugify(user.id || "contact");
}

function mapContact(env: Env, request: Request, row: ContactRow) {
  return {
    user_id: row.user_id,
    user_name: row.user_name || "User",
    slug: row.slug,
    enabled: Boolean(row.enabled),
    headline: row.headline,
    bio: row.bio,
    photo_url: row.photo_url,
    email_public: row.email_public,
    phone_public: row.phone_public,
    linkedin_url: row.linkedin_url,
    github_url: row.github_url,
    x_url: row.x_url,
    website_url: row.website_url,
    links: parseLinks(row.links),
    source_profile_url: row.source_profile_url,
    source_profile_imported_at: row.source_profile_imported_at,
    public_url: publicUrl(env, request, row.slug),
    updated_at: row.updated_at,
  };
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) fail(401, "Authentication required");
  return match[1].trim();
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

async function uniqueSlug(db: D1Database, desired: string, excludingUserId?: string) {
  const base = slugify(desired);
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const row = await db
      .prepare("SELECT user_id FROM user_contact_pages WHERE slug = ?")
      .bind(candidate)
      .first<{ user_id: string }>();
    if (!row || row.user_id === excludingUserId) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function uniqueTableSlug(db: D1Database, table: "organizations" | "events", desired: string, excludingId?: string) {
  const base = slugify(desired);
  const rows = await db
    .prepare(`SELECT id, slug FROM ${table} WHERE slug >= ? AND slug < ? LIMIT 300`)
    .bind(base, `${base}~`)
    .all<{ id: string; slug: string }>();
  const used = new Map(
    (rows.results || [])
      .filter((row) => row.slug === base || row.slug.startsWith(`${base}-`))
      .map((row) => [row.slug, row.id]),
  );
  for (let i = 0; i < 200; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const ownerId = used.get(candidate);
    if (!ownerId || ownerId === excludingId) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function contactForUser(env: Env, request: Request, user: PidpUser): Promise<ContactRow> {
  const existing = await env.DB.prepare("SELECT * FROM user_contact_pages WHERE user_id = ?")
    .bind(user.id)
    .first<ContactRow>();
  const profileImage = userProfileImage(user);
  if (existing) {
    if (profileImage && !existing.photo_url) {
      const updatedAt = nowIso();
      await env.DB.prepare("UPDATE user_contact_pages SET photo_url = ?, updated_at = ? WHERE user_id = ?")
        .bind(profileImage, updatedAt, user.id)
        .run();
      const updated = { ...existing, photo_url: profileImage, updated_at: updatedAt };
      await ensureDefaultAdminConnection(env.DB, updated);
      return updated;
    }
    await ensureDefaultAdminConnection(env.DB, existing);
    return existing;
  }

  const created = nowIso();
  const slug = await uniqueSlug(env.DB, defaultSlug(user));
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO user_contact_pages
      (id, user_id, user_email, user_name, slug, enabled, photo_url, links, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, '[]', ?, ?)`,
  )
    .bind(id, user.id, user.email || null, userName(user), slug, profileImage, created, created)
    .run();
  const createdRow = (await env.DB.prepare("SELECT * FROM user_contact_pages WHERE id = ?").bind(id).first<ContactRow>())!;
  await ensureDefaultAdminConnection(env.DB, createdRow);
  return createdRow;
}

function cleanOptionalString(value: unknown, maxLength = 5000): string | null {
  if (value === null) return null;
  if (value === undefined) return undefined as unknown as null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanUrl(value: unknown): string | null {
  const text = cleanOptionalString(value, 1000)?.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
  if (!text) return null;
  const candidate = /^(https?:|mailto:|tel:)/i.test(text) ? text : `https://${text.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
    if (parsed.protocol === "mailto:" || parsed.protocol === "tel:") return parsed.toString();
  } catch {
    return null;
  }
  return null;
}

function cleanPublicAssetUrl(value: unknown): string | null {
  const text = cleanOptionalString(value, 1000);
  if (!text) return null;
  if (text.startsWith("/")) return `https://codecollective.us${text}`;
  return cleanUrl(text);
}

function cleanLinks(value: unknown): ContactLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = cleanOptionalString(record.label, 120);
      const url = cleanUrl(record.url);
      return label && url ? { label, url } : null;
    })
    .filter((item): item is ContactLink => Boolean(item))
    .slice(0, 40);
}

async function applyContactPayload(env: Env, row: ContactRow, user: PidpUser, payload: ContactPayload) {
  const values: Record<string, string | number | null> = {
    user_email: user.email || null,
    user_name: userName(user),
    updated_at: nowIso(),
  };

  if ("enabled" in payload) values.enabled = payload.enabled ? 1 : 0;
  if ("slug" in payload && payload.slug !== undefined && payload.slug !== null) {
    values.slug = await uniqueSlug(env.DB, String(payload.slug), user.id);
  }
  for (const key of ["headline", "bio", "email_public", "phone_public"] as const) {
    if (key in payload) values[key] = cleanOptionalString(payload[key]);
  }
  for (const key of ["photo_url", "linkedin_url", "github_url", "x_url", "website_url"] as const) {
    if (key in payload) values[key] = cleanUrl(payload[key]);
  }
  if ("links" in payload) values.links = JSON.stringify(cleanLinks(payload.links));

  const assignments = Object.keys(values).map((key) => `${key} = ?`).join(", ");
  await env.DB.prepare(`UPDATE user_contact_pages SET ${assignments} WHERE user_id = ?`)
    .bind(...Object.values(values), row.user_id)
    .run();
}

function mapOrganization(row: OrganizationRow, upcomingEventsCount = 0) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    source_url: row.source_url,
    source_urls: row.source_url ? [row.source_url] : [],
    image_url: row.image_url,
    tags: parseJsonArray(row.tags),
    seeded_from_events: true,
    claimed_by_user_id: null,
    created_by_user_id: null,
    membership_count: 0,
    upcoming_events_count: upcomingEventsCount,
    pending_claim_requests_count: 0,
    is_contested: false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapEvent(env: Env, request: Request, row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    location: row.location,
    source_url: row.source_url,
    image_url: row.image_url,
    host_org_id: row.host_org_id,
    host_org_name: row.organization_name || row.host_org_name,
    organization_name: row.organization_name || row.host_org_name,
    tags: parseJsonArray(row.tags),
    public_url: eventPublicUrl(env, request, row.slug),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function stringField(record: Record<string, unknown>, key: string, maxLength = 2000): string | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function tagsField(record: Record<string, unknown>) {
  const raw = record.tags;
  if (!Array.isArray(raw)) return "[]";
  return JSON.stringify(raw.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 40));
}

async function organizationBySourceUrl(db: D1Database, sourceUrl: string | null) {
  if (!sourceUrl) return null;
  return db.prepare("SELECT * FROM organizations WHERE source_url = ?").bind(sourceUrl).first<OrganizationRow>();
}

async function organizationByNaturalKey(db: D1Database, name: string, city: string | null) {
  if (!city) return null;
  return db
    .prepare("SELECT * FROM organizations WHERE source_url IS NULL AND lower(name) = lower(?) AND lower(city) = lower(?)")
    .bind(name, city)
    .first<OrganizationRow>();
}

async function upsertOrganization(db: D1Database, raw: Record<string, unknown>) {
  const sourceUrl = cleanUrl(raw.source_url);
  const name = stringField(raw, "name", 255) || "Organization";
  const city = stringField(raw, "city", 80);
  const existing = sourceUrl ? await organizationBySourceUrl(db, sourceUrl) : await organizationByNaturalKey(db, name, city);
  const id = existing?.id || crypto.randomUUID();
  const slug = existing?.slug || (await uniqueTableSlug(db, "organizations", name));
  const updatedAt = nowIso();
  await db.prepare(
    `INSERT INTO organizations
      (id, name, slug, description, source_url, image_url, tags, city, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      source_url = excluded.source_url,
      image_url = excluded.image_url,
      tags = excluded.tags,
      city = excluded.city,
      updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      name,
      slug,
      stringField(raw, "description", 5000),
      sourceUrl,
      cleanPublicAssetUrl(raw.image_url),
      tagsField(raw),
      city,
      existing?.created_at || updatedAt,
      updatedAt,
    )
    .run();
  return db.prepare("SELECT * FROM organizations WHERE id = ?").bind(id).first<OrganizationRow>();
}

async function upsertEvent(db: D1Database, raw: Record<string, unknown>) {
  const ingestKey = stringField(raw, "ingest_key", 255);
  const title = stringField(raw, "title", 500);
  if (!ingestKey || !title) return null;
  const existing = await db.prepare("SELECT * FROM events WHERE ingest_key = ?").bind(ingestKey).first<EventRow>();
  const hostOrgSourceUrl = cleanUrl(raw.host_org_source_url);
  const hostOrg = await organizationBySourceUrl(db, hostOrgSourceUrl);
  const id = existing?.id || crypto.randomUUID();
  const slug = existing?.slug || (await uniqueTableSlug(db, "events", `${title}-${ingestKey.slice(0, 8)}`));
  const updatedAt = nowIso();
  await db.prepare(
    `INSERT INTO events
      (id, ingest_key, title, slug, description, starts_at, ends_at, location, source_url, image_url,
       host_org_id, host_org_name, host_org_source_url, tags, city, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ingest_key) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      location = excluded.location,
      source_url = excluded.source_url,
      image_url = excluded.image_url,
      host_org_id = excluded.host_org_id,
      host_org_name = excluded.host_org_name,
      host_org_source_url = excluded.host_org_source_url,
      tags = excluded.tags,
      city = excluded.city,
      updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      ingestKey,
      title,
      slug,
      stringField(raw, "description", 10000),
      stringField(raw, "starts_at", 80),
      stringField(raw, "ends_at", 80),
      stringField(raw, "location", 1000),
      cleanUrl(raw.source_url),
      cleanPublicAssetUrl(raw.image_url),
      hostOrg?.id || null,
      stringField(raw, "host_org_name", 255),
      hostOrgSourceUrl,
      tagsField(raw),
      stringField(raw, "city", 80),
      existing?.created_at || updatedAt,
      updatedAt,
    )
    .run();
  return db.prepare("SELECT * FROM events WHERE ingest_key = ?").bind(ingestKey).first<EventRow>();
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function governanceVotes(db: D1Database, motionId: string) {
  const rows = await db
    .prepare("SELECT * FROM governance_votes WHERE motion_id = ? ORDER BY cast_at ASC")
    .bind(motionId)
    .all<GovernanceVoteRow>();
  return rows.results || [];
}

async function governanceScore(db: D1Database, motionId: string) {
  const row = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN direction = 'up' THEN 1 WHEN direction = 'down' THEN -1 ELSE 0 END), 0) AS score
       FROM governance_engagement_votes
       WHERE motion_id = ?`,
    )
    .bind(motionId)
    .first<{ score: number }>();
  return Number(row?.score || 0);
}

async function governanceVoteCounts(db: D1Database, motionId: string) {
  const row = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN direction = 'up' THEN 1 ELSE 0 END), 0) AS up,
        COALESCE(SUM(CASE WHEN direction = 'down' THEN 1 ELSE 0 END), 0) AS down,
        COALESCE(SUM(CASE WHEN direction = 'up' THEN 1 WHEN direction = 'down' THEN -1 ELSE 0 END), 0) AS score
       FROM governance_engagement_votes
       WHERE motion_id = ?`,
    )
    .bind(motionId)
    .first<{ up: number; down: number; score: number }>();
  return { up: Number(row?.up || 0), down: Number(row?.down || 0), score: Number(row?.score || 0) };
}

async function mapGovernanceMotion(db: D1Database, row: GovernanceMotionRow) {
  const votes = await governanceVotes(db, row.id);
  const score = row.score === undefined || row.score === null ? await governanceScore(db, row.id) : Number(row.score || 0);
  return {
    id: row.id,
    type: row.type,
    parent_motion_id: row.parent_motion_id,
    title: row.title,
    body: row.body,
    proposed_body_diff: row.proposed_body_diff,
    status: row.status,
    proposer_type: row.proposer_type || "user",
    proposer_id: row.proposer_id,
    proposer_name: row.proposer_name,
    proposer_user_name: row.proposer_user_name,
    proposer_org_id: row.proposer_org_id,
    proposer_org_name: row.proposer_org_name,
    seconder_id: row.seconder_id,
    seconder_name: row.seconder_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    discussion_deadline: row.discussion_deadline,
    voting_deadline: row.voting_deadline,
    quorum_required: Number(row.quorum_required || 5),
    votes: votes.map((vote) => ({
      id: vote.id,
      user_id: vote.user_id,
      user_name: vote.user_name,
      choice: vote.choice,
      cast_at: vote.cast_at,
    })),
    result: parseJsonObject(row.result),
    score,
  };
}

async function governanceMotionById(db: D1Database, motionId: string) {
  return db.prepare("SELECT * FROM governance_motions WHERE id = ?").bind(motionId).first<GovernanceMotionRow>();
}

async function requireGovernanceMotion(db: D1Database, motionId: string) {
  const row = await governanceMotionById(db, motionId);
  if (!row) fail(404, "Motion not found");
  return row;
}

function voteResultFromCounts(counts: { yea: number; nay: number; abstain: number }, quorumRequired: number) {
  const totalVotes = counts.yea + counts.nay + counts.abstain;
  return {
    yea: counts.yea,
    nay: counts.nay,
    abstain: counts.abstain,
    total_votes: totalVotes,
    total_eligible: totalVotes,
    quorum_met: totalVotes >= quorumRequired,
    passed: totalVotes >= quorumRequired && counts.yea > counts.nay,
  };
}

async function formalVoteCounts(db: D1Database, motionId: string, quorumRequired = 1) {
  const row = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN choice = 'yea' THEN 1 ELSE 0 END), 0) AS yea,
        COALESCE(SUM(CASE WHEN choice = 'nay' THEN 1 ELSE 0 END), 0) AS nay,
        COALESCE(SUM(CASE WHEN choice = 'abstain' THEN 1 ELSE 0 END), 0) AS abstain
       FROM governance_votes
       WHERE motion_id = ?`,
    )
    .bind(motionId)
    .first<{ yea: number; nay: number; abstain: number }>();
  return voteResultFromCounts(
    { yea: Number(row?.yea || 0), nay: Number(row?.nay || 0), abstain: Number(row?.abstain || 0) },
    quorumRequired,
  );
}

async function updateGovernanceStatus(db: D1Database, motionId: string, status: string, extra: Record<string, string | null> = {}) {
  const values: Record<string, string | null> = { status, updated_at: nowIso(), ...extra };
  const assignments = Object.keys(values).map((key) => `${key} = ?`).join(", ");
  await db.prepare(`UPDATE governance_motions SET ${assignments} WHERE id = ?`).bind(...Object.values(values), motionId).run();
  return requireGovernanceMotion(db, motionId);
}

function mapLedgerAccount(row: LedgerAccountRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    entity_type: row.entity_type,
    balance: Number(row.balance || 0),
    dena_balance: Number(row.dena_balance || 0),
    created_at: row.created_at,
  };
}

function mapUbiSettings(row: UbiSettingsRow) {
  return {
    interval_seconds: Number(row.interval_seconds || DEFAULT_UBI_CADENCE_SECONDS),
    dena_annual: Number(row.dena_annual || 1),
    dena_precision: Number(row.dena_precision || 6),
    entity_types: parseJsonArray(row.entity_types),
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

async function getUbiSettings(db: D1Database) {
  const row = await db.prepare("SELECT interval_seconds, dena_annual, dena_precision, entity_types, updated_at, updated_by FROM ubi_runtime_settings WHERE id = 1").first<UbiSettingsRow>();
  if (row) return mapUbiSettings(row);
  return { interval_seconds: DEFAULT_UBI_CADENCE_SECONDS, dena_annual: 1, dena_precision: 6, entity_types: ["individual"], updated_at: nowIso(), updated_by: null };
}

function normalizedEntityTypes(settings: Awaited<ReturnType<typeof getUbiSettings>>) {
  const entityTypes = settings.entity_types.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  return entityTypes.length ? entityTypes : ["individual"];
}

function roundToPrecision(value: number, precision: number) {
  const clampedPrecision = Math.max(0, Math.min(Math.trunc(precision || 0), 12));
  const factor = 10 ** clampedPrecision;
  return Math.round(value * factor) / factor;
}

function denaForElapsed(annual: number, precision: number, elapsedSeconds: number) {
  if (!Number.isFinite(annual) || annual <= 0 || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  const secondsPerYear = 365 * 24 * 60 * 60;
  return roundToPrecision((annual * elapsedSeconds) / secondsPerYear, precision);
}

function cadenceSeconds(settings: Awaited<ReturnType<typeof getUbiSettings>>) {
  const seconds = Math.trunc(Number(settings.interval_seconds || DEFAULT_UBI_CADENCE_SECONDS));
  return Math.max(1, Math.min(seconds, 365 * 24 * 60 * 60));
}

function nextPaymentDate(scheduledTime: number, settings: Awaited<ReturnType<typeof getUbiSettings>>) {
  return isoFromMillis(scheduledTime + cadenceSeconds(settings) * 1000).slice(0, 10);
}

function wholeCents(value: number) {
  if (!Number.isFinite(value) || value < 0.01) return 0;
  return Math.floor((value + Number.EPSILON) * 100) / 100;
}

async function ensureUbiTickState(db: D1Database, now: string) {
  await db.prepare("INSERT OR IGNORE INTO ubi_tick_state (id, last_tick_at, updated_at) VALUES ('singleton', ?, ?)")
    .bind(now, now)
    .run();
}

async function markUbiRunStarted(db: D1Database, runKey: string, startedAt: string) {
  const result = await db.prepare("INSERT OR IGNORE INTO ubi_tick_runs (run_key, started_at, status) VALUES (?, ?, 'running')")
    .bind(runKey, startedAt)
    .run();
  return Number(result.meta?.changes || 0) > 0;
}

export async function runUbiTick(db: D1Database, scheduledTime = Date.now()): Promise<UbiTickSummary> {
  const startedAt = isoFromMillis(scheduledTime);
  const runKey = startedAt.slice(0, 16);
  await ensureUbiTickState(db, startedAt);
  const claimed = await markUbiRunStarted(db, runKey, startedAt);
  if (!claimed) {
    return {
      run_key: runKey,
      status: "skipped",
      started_at: startedAt,
      completed_at: nowIso(),
      elapsed_seconds: 0,
      eligible_accounts: 0,
      payout_count: 0,
      accrued_amount: 0,
      paid_amount: 0,
    };
  }

  try {
    const state = await db.prepare("SELECT last_tick_at FROM ubi_tick_state WHERE id = 'singleton'").first<{ last_tick_at: string | null }>();
    const lastTickMillis = state?.last_tick_at ? Date.parse(state.last_tick_at) : Number.NaN;
    const elapsedSeconds = Number.isFinite(lastTickMillis)
      ? Math.max(0, Math.floor((scheduledTime - lastTickMillis) / 1000))
      : 0;
    const settings = await getUbiSettings(db);
    const accruedAmount = denaForElapsed(Number(settings.dena_annual || 0), Number(settings.dena_precision || 6), elapsedSeconds);
    const entityTypes = normalizedEntityTypes(settings);
    let eligibleAccounts = 0;
    let payoutCount = 0;
    let paidAmount = 0;

    const placeholders = entityTypes.map(() => "?").join(", ");
    const today = startedAt.slice(0, 10);
    if (accruedAmount > 0) {
      const eligible = await db.prepare(`SELECT id, dena_balance FROM ledger_accounts WHERE lower(entity_type) IN (${placeholders})`)
        .bind(...entityTypes)
        .all<Pick<LedgerAccountRow, "id" | "dena_balance">>();
      const eligibleRows = eligible.results || [];
      eligibleAccounts = eligibleRows.length;

      await db.prepare(`UPDATE ledger_accounts SET dena_balance = COALESCE(dena_balance, 0) + ?, updated_at = ? WHERE lower(entity_type) IN (${placeholders})`)
        .bind(accruedAmount, startedAt, ...entityTypes)
        .run();
    }
    const payoutRows = await db.prepare(
      `SELECT a.id, a.dena_balance
       FROM ledger_accounts a
       LEFT JOIN ubi_eligibility u ON u.account_id = a.id
       WHERE lower(a.entity_type) IN (${placeholders})
         AND COALESCE(a.dena_balance, 0) >= 0.01
         AND COALESCE(u.is_eligible, 1) = 1
         AND (u.next_payment_date IS NULL OR u.next_payment_date <= ?)`,
    )
      .bind(...entityTypes, today)
      .all<Pick<LedgerAccountRow, "id" | "dena_balance">>();
    const statements: D1PreparedStatement[] = [];
    const followingPaymentDate = nextPaymentDate(scheduledTime, settings);
    for (const account of payoutRows.results || []) {
      const payout = wholeCents(Number(account.dena_balance || 0));
      if (payout <= 0) continue;
      payoutCount += 1;
      paidAmount += payout;
      statements.push(
        db.prepare("UPDATE ledger_accounts SET balance = balance + ?, dena_balance = COALESCE(dena_balance, 0) - ?, updated_at = ? WHERE id = ?")
          .bind(payout, payout, startedAt, account.id),
      );
      statements.push(
        db.prepare(
          "INSERT INTO ledger_transactions (id, from_account_id, to_account_id, amount, currency, transaction_type, description, timestamp) VALUES (?, NULL, ?, ?, 'DEM', 'UBI_PAYMENT', ?, ?)",
        )
          .bind(`txn-ubi-${crypto.randomUUID()}`, account.id, payout, "Automatic UBI payout from Cloudflare scheduled Worker", startedAt),
      );
      statements.push(
        db.prepare(
          `INSERT INTO ubi_eligibility (account_id, is_eligible, next_payment_date, last_payment_amount, total_payments_received)
           VALUES (?, 1, ?, ?, ?)
           ON CONFLICT(account_id) DO UPDATE SET
            next_payment_date = excluded.next_payment_date,
            last_payment_amount = excluded.last_payment_amount,
            total_payments_received = ubi_eligibility.total_payments_received + excluded.last_payment_amount`,
        )
          .bind(account.id, followingPaymentDate, payout, payout),
      );
    }
    if (statements.length) await db.batch(statements);

    const completedAt = nowIso();
    await db.prepare("UPDATE ubi_tick_state SET last_tick_at = ?, updated_at = ? WHERE id = 'singleton'")
      .bind(startedAt, completedAt)
      .run();
    await db.prepare(
      `UPDATE ubi_tick_runs
       SET completed_at = ?, status = 'completed', eligible_accounts = ?, payout_count = ?, accrued_amount = ?, paid_amount = ?
       WHERE run_key = ?`,
    )
      .bind(completedAt, eligibleAccounts, payoutCount, accruedAmount, paidAmount, runKey)
      .run();

    return {
      run_key: runKey,
      status: "completed",
      started_at: startedAt,
      completed_at: completedAt,
      elapsed_seconds: elapsedSeconds,
      eligible_accounts: eligibleAccounts,
      payout_count: payoutCount,
      accrued_amount: accruedAmount,
      paid_amount: Math.round(paidAmount * 100) / 100,
    };
  } catch (err) {
    await db.prepare("UPDATE ubi_tick_runs SET completed_at = ?, status = 'failed', error = ? WHERE run_key = ?")
      .bind(nowIso(), err instanceof Error ? err.message.slice(0, 1000) : "Unknown UBI tick failure", runKey)
      .run();
    throw err;
  }
}

async function accountForUser(db: D1Database, user: PidpUser) {
  const email = (user.email || "").trim().toLowerCase();
  let row = email ? await db.prepare("SELECT * FROM ledger_accounts WHERE lower(email) = ?").bind(email).first<LedgerAccountRow>() : null;
  if (row) return row;
  const id = `acct-${crypto.randomUUID()}`;
  const timestamp = nowIso();
  await db.prepare(
    "INSERT INTO ledger_accounts (id, user_id, name, email, entity_type, balance, created_at, updated_at) VALUES (?, ?, ?, ?, 'individual', 0, ?, ?)",
  )
    .bind(id, user.id, userName(user), email || `${user.id}@local.codecollective`, timestamp, timestamp)
    .run();
  await db.prepare("INSERT OR IGNORE INTO ubi_eligibility (account_id, is_eligible, next_payment_date) VALUES (?, 1, ?)")
    .bind(id, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .run();
  row = await db.prepare("SELECT * FROM ledger_accounts WHERE id = ?").bind(id).first<LedgerAccountRow>();
  return row!;
}

function mapRecentTransaction(row: LedgerTransactionRow) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    transaction_type: row.transaction_type,
    amount: Number(row.amount || 0),
    currency: row.currency || "DEM",
    description: row.description || "",
    from_account_id: row.from_account_id,
    to_account_id: row.to_account_id,
    from_account_name: row.from_account_name || null,
    to_account_name: row.to_account_name || null,
  };
}

app.onError((err) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error("org-worker error", err);
  return json({ detail: "Internal server error" }, 500);
});

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "authorization,content-type,x-requested-with",
      },
    });
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true, service: "org-worker" }));

app.get("/admin/me", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const isAdmin = adminUser(user, c.env);
  return c.json({ is_admin: isAdmin, is_sysadmin: isAdmin });
});

app.get("/api/network/contact/me", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const row = await contactForUser(c.env, c.req.raw, user);
  return c.json(mapContact(c.env, c.req.raw, row));
});

app.put("/api/network/contact/me", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const row = await contactForUser(c.env, c.req.raw, user);
  const payload = (await c.req.json().catch(() => ({}))) as ContactPayload;
  await applyContactPayload(c.env, row, user, payload);
  const updated = await c.env.DB.prepare("SELECT * FROM user_contact_pages WHERE user_id = ?").bind(user.id).first<ContactRow>();
  return c.json(mapContact(c.env, c.req.raw, updated!));
});

app.post("/api/network/contact/me/import", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const row = await contactForUser(c.env, c.req.raw, user);
  const payload = (await c.req.json().catch(() => ({}))) as { source_url?: string };
  const sourceUrl = cleanUrl(payload.source_url);
  if (!sourceUrl) fail(400, "source_url is required");
  const importedAt = nowIso();
  await c.env.DB.prepare("UPDATE user_contact_pages SET source_profile_url = ?, source_profile_imported_at = ?, updated_at = ? WHERE user_id = ?")
    .bind(sourceUrl, importedAt, importedAt, user.id)
    .run();
  const updated = await c.env.DB.prepare("SELECT * FROM user_contact_pages WHERE user_id = ?").bind(row.user_id).first<ContactRow>();
  return c.json({ contact: mapContact(c.env, c.req.raw, updated!), imported_fields: ["source_profile_url"], source_url: sourceUrl });
});

app.get("/api/network/notifications/summary", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const unread = await c.env.DB.prepare("SELECT count(*) AS n FROM user_notifications WHERE user_id = ? AND status = 'unread'")
    .bind(user.id)
    .first<{ n: number }>();
  const pendingConnections = await c.env.DB.prepare("SELECT count(*) AS n FROM user_connections WHERE recipient_user_id = ? AND status = 'pending'")
    .bind(user.id)
    .first<{ n: number }>();
  return c.json({
    unread_count: Number(unread?.n || 0),
    pending_connections_count: Number(pendingConnections?.n || 0),
  });
});

app.get("/api/network/notifications", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "20", 10) || 20, 100));
  const rows = await c.env.DB.prepare(
    `SELECT * FROM user_notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(user.id, limit)
    .all<NotificationRow>();
  return c.json((rows.results || []).map(mapNotification));
});

app.post("/api/network/notifications/read", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const readAt = nowIso();
  await c.env.DB.prepare("UPDATE user_notifications SET status = 'read', read_at = ? WHERE user_id = ? AND status = 'unread'")
    .bind(readAt, user.id)
    .run();
  return c.json({ ok: true, read_at: readAt });
});

app.get("/api/network/connections/requests", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM user_connections
     WHERE recipient_user_id = ? AND status = 'pending'
     ORDER BY requested_at DESC
     LIMIT 100`,
  )
    .bind(user.id)
    .all<ConnectionRow>();
  return c.json((rows.results || []).map((row) => mapConnection(row, user.id)));
});

app.post("/api/network/connections/request", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const payload = (await c.req.json().catch(() => ({}))) as { target_user_id?: string };
  const targetUserId = String(payload.target_user_id || "").trim();
  if (!targetUserId) fail(400, "target_user_id is required");
  if (targetUserId === user.id) fail(400, "Cannot connect to yourself");
  const target = await contactByUserId(c.env.DB, targetUserId);
  if (!target) fail(404, "Person not found");

  const pairKey = connectionPairKey(user.id, targetUserId);
  const now = nowIso();
  const existing = await c.env.DB.prepare("SELECT * FROM user_connections WHERE pair_key = ?")
    .bind(pairKey)
    .first<ConnectionRow>();
  if (existing?.status === "accepted" || existing?.status === "pending") {
    return c.json(mapConnection(existing, user.id));
  }

  const id = existing?.id || `conn-${crypto.randomUUID()}`;
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE user_connections
       SET requester_user_id = ?, requester_user_name = ?, recipient_user_id = ?, recipient_user_name = ?,
           status = 'pending', requested_at = ?, responded_at = NULL, updated_at = ?
       WHERE id = ?`,
    )
      .bind(user.id, userName(user), targetUserId, target.user_name || "User", now, now, id)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO user_connections
       (id, pair_key, requester_user_id, requester_user_name, recipient_user_id, recipient_user_name, status, requested_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(id, pairKey, user.id, userName(user), targetUserId, target.user_name || "User", now, now)
      .run();
  }

  await c.env.DB.prepare(
    `INSERT INTO user_notifications
     (id, user_id, type, actor_user_id, actor_user_name, entity_id, title, body, status, created_at)
     VALUES (?, ?, 'connection_request', ?, ?, ?, ?, ?, 'unread', ?)`,
  )
    .bind(
      `note-${crypto.randomUUID()}`,
      targetUserId,
      user.id,
      userName(user),
      id,
      "New connection request",
      `${userName(user)} wants to connect with you.`,
      now,
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM user_connections WHERE id = ?").bind(id).first<ConnectionRow>();
  return c.json(mapConnection(row!, user.id), 201);
});

async function respondToConnection(env: Env, request: Request, connectionId: string, status: "accepted" | "declined") {
  const user = await currentUser(env, request);
  const row = await env.DB.prepare("SELECT * FROM user_connections WHERE id = ?").bind(connectionId).first<ConnectionRow>();
  if (!row || row.recipient_user_id !== user.id || row.status !== "pending") fail(404, "Connection request not found");
  const now = nowIso();
  await env.DB.prepare("UPDATE user_connections SET status = ?, responded_at = ?, updated_at = ? WHERE id = ?")
    .bind(status, now, now, connectionId)
    .run();
  await env.DB.prepare("UPDATE user_notifications SET status = 'read', read_at = ? WHERE user_id = ? AND entity_id = ? AND type = 'connection_request'")
    .bind(now, user.id, connectionId)
    .run();
  if (status === "accepted") {
    await env.DB.prepare(
      `INSERT INTO user_notifications
       (id, user_id, type, actor_user_id, actor_user_name, entity_id, title, body, status, created_at)
       VALUES (?, ?, 'connection_accepted', ?, ?, ?, ?, ?, 'unread', ?)`,
    )
      .bind(
        `note-${crypto.randomUUID()}`,
        row.requester_user_id,
        user.id,
        userName(user),
        connectionId,
        "Connection accepted",
        `${userName(user)} accepted your connection request.`,
        now,
      )
      .run();
  }
  const updated = await env.DB.prepare("SELECT * FROM user_connections WHERE id = ?").bind(connectionId).first<ConnectionRow>();
  return mapConnection(updated!, user.id);
}

app.post("/api/network/connections/:id/accept", async (c) => c.json(await respondToConnection(c.env, c.req.raw, c.req.param("id"), "accepted")));
app.post("/api/network/connections/:id/decline", async (c) => c.json(await respondToConnection(c.env, c.req.raw, c.req.param("id"), "declined")));

async function publicContact(env: Env, request: Request, slug: string) {
  const requestedSlug = String(slug || "").trim();
  if (!requestedSlug) fail(404, "Public profile not found");
  const row = await env.DB.prepare("SELECT * FROM user_contact_pages WHERE slug = ?")
    .bind(requestedSlug)
    .first<ContactRow>();
  if (!row) fail(404, "Public profile not found");
  if (!row.enabled) {
    try {
      const user = await currentUser(env, request);
      if (user.id !== row.user_id) fail(404, "Public profile not found");
    } catch {
      fail(404, "Public profile not found");
    }
  }
  return mapContact(env, request, row);
}

async function publicUsers(env: Env, request: Request, query = "", limit = 40) {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const q = query.trim().toLowerCase();
  const rows = q
    ? await env.DB.prepare(
        `SELECT * FROM user_contact_pages
         WHERE enabled = 1 AND (lower(user_name) LIKE ? OR lower(headline) LIKE ? OR lower(slug) LIKE ?)
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
        .bind(`%${q}%`, `%${q}%`, `%${q}%`, safeLimit)
        .all<ContactRow>()
    : await env.DB.prepare(
        `SELECT * FROM user_contact_pages
         WHERE enabled = 1
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
        .bind(safeLimit)
        .all<ContactRow>();
  return (rows.results || []).map((row) => mapContact(env, request, row));
}

async function networkUsers(env: Env, request: Request, query = "", limit = 500) {
  const user = await currentUser(env, request);
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const q = query.trim().toLowerCase();
  const rows = q
    ? await env.DB.prepare(
        `SELECT * FROM user_contact_pages
         WHERE lower(user_name) LIKE ? OR lower(user_email) LIKE ? OR lower(slug) LIKE ?
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
        .bind(`%${q}%`, `%${q}%`, `%${q}%`, safeLimit)
        .all<ContactRow>()
    : await env.DB.prepare(
        `SELECT * FROM user_contact_pages
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
        .bind(safeLimit)
        .all<ContactRow>();
  const contactRows = rows.results || [];
  const statuses = await connectionStatusMap(env.DB, user.id, contactRows.map((row) => row.user_id));
  return contactRows.map((row) => ({
    user_id: row.user_id,
    user_name: row.user_name || "User",
    email: row.user_email || "",
    created_at: row.created_at,
    contact_slug: row.slug,
    contact_enabled: Boolean(row.enabled),
    headline: row.headline,
    photo_url: row.photo_url,
    connection_status: row.user_id === user.id ? "self" : statuses.get(row.user_id) || "none",
  }));
}

app.post("/api/network/ingest/calendar", async (c) => {
  const configuredToken = c.env.ORG_INGEST_TOKEN || "";
  if (!configuredToken) fail(503, "Calendar ingest is not configured");
  const provided = bearerToken(c.req.raw);
  if (provided !== configuredToken) fail(401, "Invalid ingest token");
  const payload = (await c.req.json().catch(() => ({}))) as CalendarIngestPayload;
  const orgs = Array.isArray(payload.organizations) ? payload.organizations : [];
  const events = Array.isArray(payload.events) ? payload.events : [];

  let insertedOrUpdatedOrgs = 0;
  let insertedOrUpdatedEvents = 0;
  for (const raw of orgs) {
    if (!raw || typeof raw !== "object") continue;
    const row = await upsertOrganization(c.env.DB, raw);
    if (row) insertedOrUpdatedOrgs += 1;
  }
  for (const raw of events) {
    if (!raw || typeof raw !== "object") continue;
    const row = await upsertEvent(c.env.DB, raw);
    if (row) insertedOrUpdatedEvents += 1;
  }

  return c.json({
    ok: true,
    organizations: insertedOrUpdatedOrgs,
    events: insertedOrUpdatedEvents,
  });
});

app.get("/api/network/orgs/public", async (c) => {
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "300", 10) || 300, 500));
  const rows = q
    ? await c.env.DB.prepare(
        `SELECT o.*,
          (SELECT count(*) FROM events e WHERE e.host_org_id = o.id AND (e.starts_at IS NULL OR e.starts_at >= datetime('now'))) AS upcoming_events_count
         FROM organizations o
         WHERE lower(o.name) LIKE ? OR lower(o.description) LIKE ? OR lower(o.slug) LIKE ?
         ORDER BY upcoming_events_count DESC, lower(o.name) ASC
         LIMIT ?`,
      )
        .bind(`%${q}%`, `%${q}%`, `%${q}%`, limit)
        .all<OrganizationRow & { upcoming_events_count: number }>()
    : await c.env.DB.prepare(
        `SELECT o.*,
          (SELECT count(*) FROM events e WHERE e.host_org_id = o.id AND (e.starts_at IS NULL OR e.starts_at >= datetime('now'))) AS upcoming_events_count
         FROM organizations o
         ORDER BY upcoming_events_count DESC, lower(o.name) ASC
         LIMIT ?`,
      )
        .bind(limit)
        .all<OrganizationRow & { upcoming_events_count: number }>();
  return c.json((rows.results || []).map((row) => mapOrganization(row, Number(row.upcoming_events_count || 0))));
});

app.get("/api/network/orgs/public/:slug", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM organizations WHERE slug = ?")
    .bind(slugify(c.req.param("slug")))
    .first<OrganizationRow>();
  if (!row) fail(404, "Organization not found");
  const count = await c.env.DB.prepare("SELECT count(*) AS n FROM events WHERE host_org_id = ? AND (starts_at IS NULL OR starts_at >= datetime('now'))")
    .bind(row.id)
    .first<{ n: number }>();
  return c.json({ ...mapOrganization(row, Number(count?.n || 0)), public_url: orgPublicUrl(c.env, c.req.raw, row.slug) });
});

app.get("/api/network/orgs/public/:slug/events", async (c) => {
  const org = await c.env.DB.prepare("SELECT * FROM organizations WHERE slug = ?")
    .bind(slugify(c.req.param("slug")))
    .first<OrganizationRow>();
  if (!org) return c.json([]);
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "60", 10) || 60, 200));
  const rows = await c.env.DB.prepare(
    `SELECT e.*, o.name AS organization_name
     FROM events e
     LEFT JOIN organizations o ON o.id = e.host_org_id
     WHERE e.host_org_id = ?
     ORDER BY COALESCE(e.starts_at, e.created_at) ASC
     LIMIT ?`,
  )
    .bind(org.id, limit)
    .all<EventRow>();
  return c.json((rows.results || []).map((row) => mapEvent(c.env, c.req.raw, row)));
});

app.get("/api/network/orgs/public/:slug/admins", (c) => c.json([]));
app.get("/api/network/orgs/public/:slug/chat-feed", (c) => c.json({ organization_slug: c.req.param("slug"), rooms: [] }));

app.get("/api/network/events/public", async (c) => {
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const upcomingOnly = (c.req.query("upcoming_only") || "true").toLowerCase() !== "false";
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "120", 10) || 120, 500));
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    filters.push("(lower(e.title) LIKE ? OR lower(e.description) LIKE ? OR lower(e.location) LIKE ? OR lower(o.name) LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (upcomingOnly) {
    filters.push("(e.starts_at IS NULL OR e.starts_at >= datetime('now'))");
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(
    `SELECT e.*, o.name AS organization_name
     FROM events e
     LEFT JOIN organizations o ON o.id = e.host_org_id
     ${where}
     ORDER BY COALESCE(e.starts_at, e.created_at) ASC
     LIMIT ?`,
  )
    .bind(...binds, limit)
    .all<EventRow>();
  return c.json((rows.results || []).map((row) => mapEvent(c.env, c.req.raw, row)));
});

app.get("/api/network/events/public/:slug", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT e.*, o.name AS organization_name
     FROM events e
     LEFT JOIN organizations o ON o.id = e.host_org_id
     WHERE e.slug = ?`,
  )
    .bind(slugify(c.req.param("slug")))
    .first<EventRow>();
  if (!row) fail(404, "Event not found");
  return c.json(mapEvent(c.env, c.req.raw, row));
});

app.get("/api/network/events/public/:slug/chat", (c) =>
  c.json({
    event_slug: c.req.param("slug"),
    room_exists: false,
    room_id: null,
    room_alias: null,
    room_name: null,
    messages: [],
  }),
);

app.get("/api/network/orgs", async (c) => {
  await currentUser(c.env, c.req.raw);
  const mine = (c.req.query("mine") || "").toLowerCase() === "true";
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "300", 10) || 300, 500));
  if (mine) return c.json([]);
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    filters.push("(lower(name) LIKE ? OR lower(description) LIKE ? OR lower(slug) LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(`SELECT * FROM organizations ${where} ORDER BY lower(name) ASC LIMIT ?`)
    .bind(...binds, limit)
    .all<OrganizationRow>();
  return c.json((rows.results || []).map((row) => mapOrganization(row)));
});

app.post("/api/network/orgs", async (c) => {
  await currentUser(c.env, c.req.raw);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const row = await upsertOrganization(c.env.DB, {
    name: stringField(payload, "name", 255) || "Organization",
    description: stringField(payload, "description", 5000),
    source_url: cleanUrl(payload.source_url),
    image_url: cleanPublicAssetUrl(payload.image_url),
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    city: stringField(payload, "city", 80),
  });
  return c.json(mapOrganization(row!), 201);
});

app.get("/api/network/orgs/:organizationId", async (c) => {
  await currentUser(c.env, c.req.raw);
  const row = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ? OR slug = ?")
    .bind(c.req.param("organizationId"), slugify(c.req.param("organizationId")))
    .first<OrganizationRow>();
  if (!row) fail(404, "Organization not found");
  return c.json(mapOrganization(row));
});

app.patch("/api/network/orgs/:organizationId", async (c) => {
  await currentUser(c.env, c.req.raw);
  const existing = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?")
    .bind(c.req.param("organizationId"))
    .first<OrganizationRow>();
  if (!existing) fail(404, "Organization not found");
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const updatedAt = nowIso();
  await c.env.DB.prepare(
    `UPDATE organizations SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      image_url = COALESCE(?, image_url),
      tags = COALESCE(?, tags),
      city = COALESCE(?, city),
      updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      stringField(payload, "name", 255),
      stringField(payload, "description", 5000),
      cleanPublicAssetUrl(payload.image_url),
      Array.isArray(payload.tags) ? JSON.stringify(payload.tags.map((item) => String(item || "").trim()).filter(Boolean)) : null,
      stringField(payload, "city", 80),
      updatedAt,
      existing.id,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(existing.id).first<OrganizationRow>();
  return c.json(mapOrganization(row!));
});

app.post("/api/network/orgs/:organizationId/claim", async (c) => {
  await currentUser(c.env, c.req.raw);
  const row = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(c.req.param("organizationId")).first<OrganizationRow>();
  if (!row) fail(404, "Organization not found");
  return c.json(mapOrganization(row));
});
app.post("/api/network/orgs/:organizationId/unclaim", async (c) => {
  await currentUser(c.env, c.req.raw);
  const row = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?").bind(c.req.param("organizationId")).first<OrganizationRow>();
  if (!row) fail(404, "Organization not found");
  return c.json(mapOrganization(row));
});
app.get("/api/network/orgs/:organizationId/members", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json([]);
});
app.post("/api/network/orgs/:organizationId/members", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Organization memberships are not implemented in the Cloudflare org worker yet" }, 501);
});
app.get("/api/network/orgs/:organizationId/claim-requests", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json([]);
});
app.post("/api/network/orgs/:organizationId/claim-requests", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Organization claim requests are not implemented in the Cloudflare org worker yet" }, 501);
});
app.post("/api/network/claim-requests/:claimRequestId/approve", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Organization claim requests are not implemented in the Cloudflare org worker yet" }, 501);
});
app.post("/api/network/claim-requests/:claimRequestId/reject", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Organization claim requests are not implemented in the Cloudflare org worker yet" }, 501);
});
app.get("/api/network/claim-requests", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json([]);
});
app.get("/api/network/audit-events", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json([]);
});

app.get("/api/network/events", async (c) => {
  await currentUser(c.env, c.req.raw);
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "300", 10) || 300, 500));
  const rows = await c.env.DB.prepare(
    `SELECT e.*, o.name AS organization_name
     FROM events e
     LEFT JOIN organizations o ON o.id = e.host_org_id
     ORDER BY COALESCE(e.starts_at, e.created_at) ASC
     LIMIT ?`,
  )
    .bind(limit)
    .all<EventRow>();
  return c.json((rows.results || []).map((row) => mapEvent(c.env, c.req.raw, row)));
});

app.post("/api/network/events", async (c) => {
  await currentUser(c.env, c.req.raw);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = stringField(payload, "title", 500) || stringField(payload, "name", 500);
  if (!title) fail(400, "title is required");
  const row = await upsertEvent(c.env.DB, {
    ...payload,
    title,
    ingest_key: stringField(payload, "ingest_key", 255) || crypto.randomUUID(),
  });
  return c.json(mapEvent(c.env, c.req.raw, row!), 201);
});

app.post("/api/network/events/:eventId/claim", async (c) => {
  await currentUser(c.env, c.req.raw);
  const row = await c.env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(c.req.param("eventId")).first<EventRow>();
  if (!row) fail(404, "Event not found");
  return c.json(mapEvent(c.env, c.req.raw, row));
});
app.post("/api/network/events/:eventId/unclaim", async (c) => {
  await currentUser(c.env, c.req.raw);
  const row = await c.env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(c.req.param("eventId")).first<EventRow>();
  if (!row) fail(404, "Event not found");
  return c.json(mapEvent(c.env, c.req.raw, row));
});
app.get("/api/network/events/:eventId/attendance", async (c) => c.json({ event_id: c.req.param("eventId"), attendees: [], count: 0 }));

app.get("/api/network/scans", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json([]);
});
app.post("/api/network/scans", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Business card scanning is not implemented in the Cloudflare org worker yet" }, 501);
});
app.get("/api/network/scans/:scanId/image", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Scan image storage is not implemented in the Cloudflare org worker yet" }, 501);
});

app.get("/api/network/chat/rooms", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json([]);
});
app.get("/api/network/chat/link-preview", async (c) => {
  const target = c.req.query("url") || "";
  return c.json({ url: target, title: target, description: "", image_url: null });
});

app.get("/api/network/users/public", async (c) => {
  const q = c.req.query("q") || "";
  const limit = Number.parseInt(c.req.query("limit") || "40", 10);
  return c.json(await publicUsers(c.env, c.req.raw, q, Number.isFinite(limit) ? limit : 40));
});
app.get("/api/network/users", async (c) => {
  await currentUser(c.env, c.req.raw);
  const q = c.req.query("q") || "";
  const limit = Number.parseInt(c.req.query("limit") || "500", 10);
  return c.json(await networkUsers(c.env, c.req.raw, q, Number.isFinite(limit) ? limit : 500));
});

app.get("/api/accounts", async (c) => {
  await currentUser(c.env, c.req.raw);
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const sort = c.req.query("sort") || "balance_desc";
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "500", 10) || 500, 2000));
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    filters.push("(lower(name) LIKE ? OR lower(email) LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  const orderBy =
    sort === "balance_asc"
      ? "balance ASC, lower(name) ASC"
      : sort === "name_asc"
        ? "lower(name) ASC"
        : sort === "name_desc"
          ? "lower(name) DESC"
          : "balance DESC, lower(name) ASC";
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(`SELECT * FROM ledger_accounts ${where} ORDER BY ${orderBy} LIMIT ?`)
    .bind(...binds, limit)
    .all<LedgerAccountRow>();
  return c.json((rows.results || []).map(mapLedgerAccount));
});

app.get("/api/admin/accounts", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!adminUser(user, c.env)) return c.json([]);
  const rows = await c.env.DB.prepare("SELECT * FROM ledger_accounts ORDER BY balance DESC, lower(name) ASC")
    .all<LedgerAccountRow>();
  return c.json((rows.results || []).map(mapLedgerAccount));
});

app.get("/api/accounts/me", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  return c.json(mapLedgerAccount(await accountForUser(c.env.DB, user)));
});

app.get("/api/accounts/me/automation", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const account = await accountForUser(c.env.DB, user);
  const base = new URL(c.req.url).origin;
  return c.json({
    account_id: account.id,
    name: account.name,
    email: account.email,
    balance: Number(account.balance || 0),
    currency: "DEM",
    account_endpoint: `${base}/api/accounts/me`,
    incoming_transactions_endpoint: `${base}/api/accounts/me/transactions/incoming?limit=50`,
    all_transactions_endpoint: `${base}/api/accounts/me/transactions?limit=50`,
    send_payment_endpoint: `${base}/api/transactions`,
    send_url_template: `${base}/send?to=${account.id}&amount={amount}`,
    updated_at: account.updated_at,
  });
});

app.get("/api/accounts/me/transactions", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const account = await accountForUser(c.env.DB, user);
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "50", 10) || 50, 500));
  const rows = await c.env.DB.prepare(
    `SELECT t.*, fa.name AS from_account_name, ta.name AS to_account_name
     FROM ledger_transactions t
     LEFT JOIN ledger_accounts fa ON fa.id = t.from_account_id
     LEFT JOIN ledger_accounts ta ON ta.id = t.to_account_id
     WHERE t.from_account_id = ? OR t.to_account_id = ?
     ORDER BY t.timestamp DESC
     LIMIT ?`,
  )
    .bind(account.id, account.id, limit)
    .all<LedgerTransactionRow>();
  return c.json((rows.results || []).map(mapRecentTransaction));
});

app.get("/api/accounts/me/transactions/incoming", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const account = await accountForUser(c.env.DB, user);
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "50", 10) || 50, 500));
  const rows = await c.env.DB.prepare(
    `SELECT t.*, fa.name AS from_account_name, ta.name AS to_account_name
     FROM ledger_transactions t
     LEFT JOIN ledger_accounts fa ON fa.id = t.from_account_id
     LEFT JOIN ledger_accounts ta ON ta.id = t.to_account_id
     WHERE t.to_account_id = ?
     ORDER BY t.timestamp DESC
     LIMIT ?`,
  )
    .bind(account.id, limit)
    .all<LedgerTransactionRow>();
  return c.json((rows.results || []).map(mapRecentTransaction));
});

app.post("/api/transactions", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const sender = await accountForUser(c.env.DB, user);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) fail(400, "amount must be greater than 0");
  const toAccountId = stringField(payload, "to_account_id", 120);
  const recipient = toAccountId ? await c.env.DB.prepare("SELECT * FROM ledger_accounts WHERE id = ?").bind(toAccountId).first<LedgerAccountRow>() : null;
  if (toAccountId && !recipient) fail(404, "Recipient account not found");
  if (Number(sender.balance || 0) < amount) fail(400, "Insufficient funds");
  const timestamp = nowIso();
  const transactionId = `txn-${crypto.randomUUID()}`;
  await c.env.DB.prepare("UPDATE ledger_accounts SET balance = balance - ?, updated_at = ? WHERE id = ?").bind(amount, timestamp, sender.id).run();
  if (recipient) {
    await c.env.DB.prepare("UPDATE ledger_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?").bind(amount, timestamp, recipient.id).run();
  }
  await c.env.DB.prepare(
    "INSERT INTO ledger_transactions (id, from_account_id, to_account_id, amount, currency, transaction_type, description, timestamp) VALUES (?, ?, ?, ?, 'DEM', ?, ?, ?)",
  )
    .bind(transactionId, sender.id, recipient?.id || null, amount, stringField(payload, "transaction_type", 80) || "transfer", stringField(payload, "description", 1000) || "Transfer", timestamp)
    .run();
  const row = await c.env.DB.prepare(
    `SELECT t.*, fa.name AS from_account_name, ta.name AS to_account_name
     FROM ledger_transactions t
     LEFT JOIN ledger_accounts fa ON fa.id = t.from_account_id
     LEFT JOIN ledger_accounts ta ON ta.id = t.to_account_id
     WHERE t.id = ?`,
  )
    .bind(transactionId)
    .first<LedgerTransactionRow>();
  return c.json(mapRecentTransaction(row!), 201);
});

app.get("/api/transactions/recent", async (c) => {
  await currentUser(c.env, c.req.raw);
  const limit = Math.max(1, Math.min(Number.parseInt(c.req.query("limit") || "10", 10) || 10, 100));
  const rows = await c.env.DB.prepare(
    `SELECT t.*, fa.name AS from_account_name, ta.name AS to_account_name
     FROM ledger_transactions t
     LEFT JOIN ledger_accounts fa ON fa.id = t.from_account_id
     LEFT JOIN ledger_accounts ta ON ta.id = t.to_account_id
     ORDER BY t.timestamp DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<LedgerTransactionRow>();
  return c.json((rows.results || []).map(mapRecentTransaction));
});

app.get("/api/system/money-supply/history", async (c) => {
  await currentUser(c.env, c.req.raw);
  const days = Math.max(1, Math.min(Number.parseInt(c.req.query("days") || "365", 10) || 365, 3650));
  const current = await c.env.DB.prepare("SELECT COALESCE(SUM(balance), 0) AS total FROM ledger_accounts").first<{ total: number }>();
  const currentTotal = Number(current?.total || 0);
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const points: Array<{ timestamp: string; total_supply: number }> = [];
  const pointCount = Math.min(days, 365) + 1;
  for (let i = pointCount - 1; i >= 0; i -= 1) {
    const timestamp = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    if (timestamp.getTime() < start) continue;
    points.push({ timestamp: timestamp.toISOString(), total_supply: currentTotal });
  }
  if (points.length === 0) points.push({ timestamp: nowIso(), total_supply: currentTotal });
  return c.json({ points, current_total_supply: currentTotal, currency: "DEM" });
});

app.get("/api/ubi/settings", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json(await getUbiSettings(c.env.DB));
});

app.patch("/api/ubi/settings", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!adminUser(user, c.env)) fail(403, "Admin access required");
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getUbiSettings(c.env.DB);
  const intervalSeconds = Math.max(1, Math.min(Number(payload.interval_seconds ?? current.interval_seconds) || current.interval_seconds, 60 * 60 * 24 * 365));
  const denaAnnual = Math.max(0, Number(payload.dena_annual ?? current.dena_annual) || 0);
  const denaPrecision = Math.max(0, Math.min(Number(payload.dena_precision ?? current.dena_precision) || current.dena_precision, 12));
  const entityTypes = Array.isArray(payload.entity_types)
    ? payload.entity_types.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean).slice(0, 20)
    : current.entity_types;
  if (entityTypes.length === 0) fail(400, "At least one entity type is required");
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO ubi_runtime_settings (id, interval_seconds, dena_annual, dena_precision, entity_types, updated_at, updated_by)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      interval_seconds = excluded.interval_seconds,
      dena_annual = excluded.dena_annual,
      dena_precision = excluded.dena_precision,
      entity_types = excluded.entity_types,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`,
  )
    .bind(intervalSeconds, denaAnnual, denaPrecision, JSON.stringify(entityTypes), timestamp, user.email || user.id)
    .run();
  return c.json(await getUbiSettings(c.env.DB));
});

app.post("/api/ubi/tick", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!adminUser(user, c.env)) fail(403, "Admin access required");
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const scheduledTime = payload.scheduled_time ? Date.parse(String(payload.scheduled_time)) : Date.now();
  if (!Number.isFinite(scheduledTime)) fail(400, "scheduled_time must be an ISO timestamp");
  return c.json(await runUbiTick(c.env.DB, scheduledTime));
});

app.get("/api/ubi/tick-status", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  if (!adminUser(user, c.env)) fail(403, "Admin access required");
  const state = await c.env.DB.prepare("SELECT * FROM ubi_tick_state WHERE id = 'singleton'").first<Record<string, unknown>>();
  const runs = await c.env.DB.prepare("SELECT * FROM ubi_tick_runs ORDER BY started_at DESC LIMIT 10").all<Record<string, unknown>>();
  return c.json({ state, recent_runs: runs.results || [] });
});

app.get("/api/ubi/eligibility", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const account = await accountForUser(c.env.DB, user);
  const settings = await getUbiSettings(c.env.DB);
  const row = await c.env.DB.prepare("SELECT * FROM ubi_eligibility WHERE account_id = ?")
    .bind(account.id)
    .first<{ is_eligible: number; next_payment_date: string | null; last_payment_amount: number; total_payments_received: number }>();
  if (!row) return c.json({ is_eligible: false, reason: "Not enrolled in UBI system" });
  const today = new Date().toISOString().slice(0, 10);
  const nextPaymentDate = row.next_payment_date || today;
  return c.json({
    is_eligible: Boolean(row.is_eligible),
    payment_due: Boolean(row.is_eligible) && nextPaymentDate <= today,
    estimated_amount: Number(settings.dena_annual || 0),
    next_payment_date: nextPaymentDate,
    last_payment_amount: Number(row.last_payment_amount || 0),
    total_payments_received: Number(row.total_payments_received || 0),
  });
});

app.get("/api/system/metrics", async (c) => {
  await currentUser(c.env, c.req.raw);
  const accountStats = await c.env.DB.prepare(
    `SELECT
      COUNT(*) AS total_accounts,
      COALESCE(AVG(balance), 0) AS average_balance,
      COALESCE(SUM(balance), 0) AS total_money_supply,
      COALESCE(SUM(CASE WHEN lower(entity_type) = 'individual' THEN 1 ELSE 0 END), 0) AS individual_accounts,
      COALESCE(SUM(CASE WHEN lower(entity_type) = 'business' THEN 1 ELSE 0 END), 0) AS business_accounts,
      COALESCE(SUM(CASE WHEN lower(entity_type) = 'nonprofit' THEN 1 ELSE 0 END), 0) AS nonprofit_accounts
     FROM ledger_accounts`,
  ).first<Record<string, number>>();
  const transactionStats = await c.env.DB.prepare(
    `SELECT
      COUNT(*) AS total_transactions,
      COALESCE(SUM(amount), 0) AS total_transaction_volume
     FROM ledger_transactions`,
  ).first<Record<string, number>>();
  return c.json({
    ...(accountStats || {}),
    ...(transactionStats || {}),
    timestamp: nowIso(),
    market_open: true,
    currency: "DEM",
  });
});

app.get("/api/stocks", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json([]);
});
app.post("/api/stocks", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Stock issuance is not implemented in the Cloudflare org worker yet" }, 501);
});
app.post("/api/stocks/orders", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Stock orders are not implemented in the Cloudflare org worker yet" }, 501);
});
app.get("/api/portfolio", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ holdings: [], total_value: 0, currency: "DEM" });
});
app.get("/api/insurance/policies", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json([]);
});
app.post("/api/insurance/policies", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Insurance policies are not implemented in the Cloudflare org worker yet" }, 501);
});
app.post("/api/fiscal/proposals", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Fiscal proposals are not implemented in the Cloudflare org worker yet" }, 501);
});
app.post("/api/fiscal/proposals/:proposalId/vote", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Fiscal proposal voting is not implemented in the Cloudflare org worker yet" }, 501);
});
app.post("/api/tax/calculate", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ tax_due: 0, currency: "DEM" });
});
app.post("/api/tax/pay", async (c) => {
  await currentUser(c.env, c.req.raw);
  return c.json({ detail: "Tax payments are not implemented in the Cloudflare org worker yet" }, 501);
});

app.get("/api/governance/motions", async (c) => {
  const url = new URL(c.req.url);
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  const statuses = url.searchParams.getAll("status").map((item) => item.trim()).filter(Boolean);
  const type = (url.searchParams.get("type") || "").trim();
  const parentMotionId = url.searchParams.get("parent_motion_id");
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    filters.push("(lower(title) LIKE ? OR lower(body) LIKE ?)");
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (statuses.length > 0) {
    filters.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    binds.push(...statuses);
  }
  if (type) {
    filters.push("type = ?");
    binds.push(type);
  }
  if (parentMotionId) {
    filters.push("parent_motion_id = ?");
    binds.push(parentMotionId);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(
    `SELECT m.*,
      COALESCE((SELECT SUM(CASE WHEN ev.direction = 'up' THEN 1 WHEN ev.direction = 'down' THEN -1 ELSE 0 END)
        FROM governance_engagement_votes ev WHERE ev.motion_id = m.id), 0) AS score
     FROM governance_motions m
     ${where}
     ORDER BY created_at DESC
     LIMIT 500`,
  )
    .bind(...binds)
    .all<GovernanceMotionRow>();
  return c.json(await Promise.all((rows.results || []).map((row) => mapGovernanceMotion(c.env.DB, row))));
});

app.post("/api/governance/motions", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = stringField(payload, "title", 500);
  const body = stringField(payload, "body", 50000);
  if (!title || !body) fail(400, "title and body are required");
  const type = stringField(payload, "type", 20) === "amendment" ? "amendment" : "main";
  const parentMotionId = stringField(payload, "parent_motion_id", 120);
  if (type === "amendment" && !parentMotionId) fail(400, "parent_motion_id is required for amendments");
  if (parentMotionId) await requireGovernanceMotion(c.env.DB, parentMotionId);
  const proposerType = stringField(payload, "proposer_type", 20) === "org" ? "org" : "user";
  const proposerOrgId = stringField(payload, "proposer_org_id", 120);
  let proposerOrgName: string | null = null;
  if (proposerType === "org" && proposerOrgId) {
    const org = await c.env.DB.prepare("SELECT name FROM organizations WHERE id = ?").bind(proposerOrgId).first<{ name: string }>();
    proposerOrgName = org?.name || null;
  }
  const id = `mot-${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO governance_motions
      (id, type, parent_motion_id, title, body, proposed_body_diff, status, proposer_type, proposer_id, proposer_name,
       proposer_user_name, proposer_org_id, proposer_org_name, created_at, updated_at, quorum_required)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      type,
      parentMotionId,
      title,
      body,
      stringField(payload, "proposed_body_diff", 50000),
      proposerType,
      user.id,
      proposerType === "org" ? proposerOrgName || "Organization" : userName(user),
      userName(user),
      proposerOrgId,
      proposerOrgName,
      createdAt,
      createdAt,
      Math.max(1, Math.min(Number(payload.quorum_required || 5) || 5, 1000000)),
    )
    .run();
  return c.json(await mapGovernanceMotion(c.env.DB, (await requireGovernanceMotion(c.env.DB, id))), 201);
});

app.get("/api/governance/motions/:motionId", async (c) => {
  return c.json(await mapGovernanceMotion(c.env.DB, await requireGovernanceMotion(c.env.DB, c.req.param("motionId"))));
});

app.post("/api/governance/motions/:motionId/second", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  if (motion.status !== "proposed") fail(400, "Motion can only be seconded when in proposed status");
  if (motion.proposer_id === user.id) fail(400, "Proposer cannot second their own motion");
  const updated = await updateGovernanceStatus(c.env.DB, motion.id, "discussion", {
    seconder_id: user.id,
    seconder_name: userName(user),
    discussion_deadline: addDaysIso(7),
  });
  return c.json(await mapGovernanceMotion(c.env.DB, updated));
});

app.post("/api/governance/motions/:motionId/open-voting", async (c) => {
  await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  if (!["discussion", "seconded", "proposed"].includes(motion.status)) fail(400, "Motion cannot be opened for voting from its current status");
  const updated = await updateGovernanceStatus(c.env.DB, motion.id, "voting", { voting_deadline: addDaysIso(7) });
  return c.json(await mapGovernanceMotion(c.env.DB, updated));
});

app.post("/api/governance/motions/:motionId/table", async (c) => {
  await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  if (["passed", "failed", "withdrawn"].includes(motion.status)) fail(400, "Motion is already closed");
  const updated = await updateGovernanceStatus(c.env.DB, motion.id, "tabled");
  return c.json(await mapGovernanceMotion(c.env.DB, updated));
});

app.post("/api/governance/motions/:motionId/withdraw", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  if (motion.proposer_id !== user.id && !adminUser(user, c.env)) fail(403, "Only the proposer can withdraw this motion");
  if (["passed", "failed"].includes(motion.status)) fail(400, "Motion is already resolved");
  const updated = await updateGovernanceStatus(c.env.DB, motion.id, "withdrawn");
  return c.json(await mapGovernanceMotion(c.env.DB, updated));
});

app.post("/api/governance/motions/:motionId/vote", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  if (motion.status !== "voting") fail(400, "Voting is not open for this motion");
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const choice = stringField(payload, "choice", 20);
  if (!choice || !["yea", "nay", "abstain"].includes(choice)) fail(400, "choice must be yea, nay, or abstain");
  await c.env.DB.prepare(
    `INSERT INTO governance_votes (id, motion_id, user_id, user_name, choice, cast_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(motion_id, user_id) DO UPDATE SET choice = excluded.choice, user_name = excluded.user_name, cast_at = excluded.cast_at`,
  )
    .bind(`vote-${crypto.randomUUID()}`, motion.id, user.id, userName(user), choice, nowIso())
    .run();
  const updated = await requireGovernanceMotion(c.env.DB, motion.id);
  return c.json(await mapGovernanceMotion(c.env.DB, updated));
});
app.post("/api/governance/motions/:motionId/votes", (c) => app.fetch(new Request(new URL(`/api/governance/motions/${c.req.param("motionId")}/vote`, c.req.url), c.req.raw), c.env));

app.post("/api/governance/motions/:motionId/resolve", async (c) => {
  await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  const result = await formalVoteCounts(c.env.DB, motion.id, Number(motion.quorum_required || 1));
  const status = result.passed ? "passed" : "failed";
  const updatedAt = nowIso();
  await c.env.DB.prepare("UPDATE governance_motions SET status = ?, result = ?, updated_at = ? WHERE id = ?")
    .bind(status, JSON.stringify(result), updatedAt, motion.id)
    .run();
  return c.json(await mapGovernanceMotion(c.env.DB, await requireGovernanceMotion(c.env.DB, motion.id)));
});

app.get("/api/governance/motions/:motionId/results", async (c) => {
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  return c.json(await formalVoteCounts(c.env.DB, motion.id, Number(motion.quorum_required || 1)));
});

app.post("/api/governance/motions/:motionId/upvote", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  const existing = await c.env.DB.prepare("SELECT direction FROM governance_engagement_votes WHERE motion_id = ? AND user_id = ?")
    .bind(motion.id, user.id)
    .first<{ direction: string }>();
  let userVote: "up" | null = "up";
  if (existing?.direction === "up") {
    await c.env.DB.prepare("DELETE FROM governance_engagement_votes WHERE motion_id = ? AND user_id = ?").bind(motion.id, user.id).run();
    userVote = null;
  } else {
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO governance_engagement_votes (motion_id, user_id, user_name, direction, created_at, updated_at)
       VALUES (?, ?, ?, 'up', ?, ?)
       ON CONFLICT(motion_id, user_id) DO UPDATE SET direction = 'up', user_name = excluded.user_name, updated_at = excluded.updated_at`,
    )
      .bind(motion.id, user.id, userName(user), timestamp, timestamp)
      .run();
  }
  return c.json({ score: await governanceScore(c.env.DB, motion.id), user_vote: userVote });
});

app.post("/api/governance/motions/:motionId/downvote", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  const existing = await c.env.DB.prepare("SELECT direction FROM governance_engagement_votes WHERE motion_id = ? AND user_id = ?")
    .bind(motion.id, user.id)
    .first<{ direction: string }>();
  let userVote: "down" | null = "down";
  if (existing?.direction === "down") {
    await c.env.DB.prepare("DELETE FROM governance_engagement_votes WHERE motion_id = ? AND user_id = ?").bind(motion.id, user.id).run();
    userVote = null;
  } else {
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO governance_engagement_votes (motion_id, user_id, user_name, direction, created_at, updated_at)
       VALUES (?, ?, ?, 'down', ?, ?)
       ON CONFLICT(motion_id, user_id) DO UPDATE SET direction = 'down', user_name = excluded.user_name, updated_at = excluded.updated_at`,
    )
      .bind(motion.id, user.id, userName(user), timestamp, timestamp)
      .run();
  }
  return c.json({ score: await governanceScore(c.env.DB, motion.id), user_vote: userVote });
});

app.get("/api/governance/motions/:motionId/user-vote", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  const row = await c.env.DB.prepare("SELECT direction FROM governance_engagement_votes WHERE motion_id = ? AND user_id = ?")
    .bind(motion.id, user.id)
    .first<{ direction: string }>();
  return c.json({ user_vote: row?.direction || null });
});

app.get("/api/governance/motions/:motionId/vote-counts", async (c) => {
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  return c.json(await governanceVoteCounts(c.env.DB, motion.id));
});

app.get("/api/governance/motions/:motionId/comments", async (c) => {
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  const rows = await c.env.DB.prepare("SELECT * FROM governance_comments WHERE motion_id = ? ORDER BY created_at ASC")
    .bind(motion.id)
    .all<GovernanceCommentRow>();
  return c.json((rows.results || []).map((row) => ({
    id: row.id,
    motion_id: row.motion_id,
    author_id: row.user_id,
    author_name: row.user_name,
    body: row.body,
    created_at: row.created_at,
  })));
});

app.post("/api/governance/motions/:motionId/comments", async (c) => {
  const user = await currentUser(c.env, c.req.raw);
  const motion = await requireGovernanceMotion(c.env.DB, c.req.param("motionId"));
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const body = stringField(payload, "body", 10000);
  if (!body) fail(400, "body is required");
  const id = `comment-${crypto.randomUUID()}`;
  const timestamp = nowIso();
  await c.env.DB.prepare(
    "INSERT INTO governance_comments (id, motion_id, user_id, user_name, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, motion.id, user.id, userName(user), body, timestamp, timestamp)
    .run();
  return c.json(
    { id, motion_id: motion.id, author_id: user.id, author_name: userName(user), body, created_at: timestamp },
    201,
  );
});

app.get("/api/network/contact/:slug", async (c) => c.json(await publicContact(c.env, c.req.raw, c.req.param("slug"))));
app.get("/api/network/users/public/:slug", async (c) => c.json(await publicContact(c.env, c.req.raw, c.req.param("slug"))));
app.get("/api/network/users/public/:slug/events", (c) => c.json([]));

app.post("/api/network/chat/bootstrap", async (c) => {
  await currentUser(c.env, c.req.raw);
  if (!c.env.ORG_MATRIX_HOMESERVER_URL || !c.env.ORG_MATRIX_ADMIN_TOKEN || !c.env.ORG_MATRIX_PASSWORD_SECRET) {
    return c.json({ detail: "Matrix bootstrap is not configured for the Cloudflare org worker" }, 503);
  }
  return c.json({ detail: "Matrix bootstrap is not implemented in the Cloudflare org worker yet" }, 501);
});

app.all("*", (c) => c.json({ detail: "Endpoint is not implemented in the Cloudflare org worker" }, 501));

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runUbiTick(env.DB, controller.scheduledTime));
  },
};
