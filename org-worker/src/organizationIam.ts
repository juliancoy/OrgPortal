export type OrganizationActor = {
  id: string;
  name: string;
  email: string | null;
  isOperator: boolean;
};

export type OrganizationRole = "owner" | "administrator" | "member";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
};

type OwnershipRow = {
  id: string;
  organization_id: string;
  owner_user_id: string;
  status: "active" | "transferred";
  started_at: string;
  ended_at: string | null;
};

type ChallengeRow = {
  id: string;
  organization_id: string;
  ownership_id: string;
  challenger_user_id: string;
  challenger_name: string | null;
  challenger_email: string | null;
  explanation: string;
  evidence_json: string;
  status: "open" | "withdrawn" | "resolved";
  resolution: "incumbent" | "challenger" | null;
  resolved_by_user_id: string | null;
  created_at: string;
  resolved_at: string | null;
  organization_name?: string;
  organization_slug?: string;
  owner_user_id?: string;
};

export class OrganizationIamError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new OrganizationIamError(status, message);
}

function parseEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const values = value.map((item) => String(item || "").trim()).filter(Boolean);
  if (values.length > 20 || values.some((item) => item.length > 2000)) fail(400, "Invalid challenge evidence");
  return values;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function auditStatement(
  db: D1Database,
  actorUserId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  subjectUserId: string | null,
  metadata: Record<string, unknown>,
  createdAt: string,
) {
  return db.prepare(
    `INSERT INTO audit_events
      (id, actor_user_id, action, resource_type, resource_id, subject_user_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), actorUserId, action, resourceType, resourceId, subjectUserId, JSON.stringify(metadata), createdAt);
}

async function requireOrganization(db: D1Database, organizationId: string) {
  const row = await db.prepare("SELECT id, name, slug FROM organizations WHERE id = ? OR slug = ?")
    .bind(organizationId, organizationId)
    .first<OrganizationRow>();
  if (!row) fail(404, "Organization not found");
  return row;
}

async function activeOwnership(db: D1Database, organizationId: string) {
  return db.prepare("SELECT * FROM organization_ownerships WHERE organization_id = ? AND status = 'active'")
    .bind(organizationId)
    .first<OwnershipRow>();
}

export async function organizationRole(db: D1Database, organizationId: string, userId: string) {
  const row = await db.prepare(
    "SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'active'",
  ).bind(organizationId, userId).first<{ role: OrganizationRole }>();
  return row?.role || null;
}

export async function authorizeOrganization(
  db: D1Database,
  actor: OrganizationActor,
  action: "claim" | "challenge" | "read_members" | "manage" | "resolve_challenge",
  organizationId: string,
) {
  await requireOrganization(db, organizationId);
  if (action === "resolve_challenge") {
    if (!actor.isOperator) fail(403, "Operator access required");
    return null;
  }
  if (action === "claim" || action === "challenge") return organizationRole(db, organizationId, actor.id);
  const role = await organizationRole(db, organizationId, actor.id);
  if (action === "read_members") {
    if (!actor.isOperator && role !== "owner" && role !== "administrator") fail(403, "Organization management access required");
    return role;
  }
  if (!actor.isOperator && role !== "owner" && role !== "administrator") fail(403, "Organization management access required");
  return role;
}

export async function claimOrganization(db: D1Database, organizationId: string, actor: OrganizationActor, now: string) {
  const organization = await requireOrganization(db, organizationId);
  await authorizeOrganization(db, actor, "claim", organization.id);
  const current = await activeOwnership(db, organization.id);
  if (current?.owner_user_id === actor.id) return current;
  if (current) fail(409, "Organization is already claimed; file an ownership challenge");

  const ownership: OwnershipRow = {
    id: crypto.randomUUID(),
    organization_id: organization.id,
    owner_user_id: actor.id,
    status: "active",
    started_at: now,
    ended_at: null,
  };
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO organization_ownerships
          (id, organization_id, owner_user_id, status, started_at, ended_at)
         VALUES (?, ?, ?, 'active', ?, NULL)`,
      ).bind(ownership.id, organization.id, actor.id, now),
      db.prepare(
        `INSERT INTO organization_memberships
          (organization_id, user_id, user_name, user_email, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)
         ON CONFLICT(organization_id, user_id) DO UPDATE SET
           user_name = excluded.user_name,
           user_email = excluded.user_email,
           role = 'owner',
           status = 'active',
           updated_at = excluded.updated_at`,
      ).bind(organization.id, actor.id, actor.name, actor.email, now, now),
      auditStatement(db, actor.id, "organization.claimed", "organization", organization.id, actor.id, { ownership_id: ownership.id }, now),
    ]);
  } catch {
    const winner = await activeOwnership(db, organization.id);
    if (winner?.owner_user_id === actor.id) return winner;
    fail(409, "Organization was claimed by another member");
  }
  return ownership;
}

export async function listOrganizationMembers(db: D1Database, organizationId: string, actor: OrganizationActor) {
  const organization = await requireOrganization(db, organizationId);
  await authorizeOrganization(db, actor, "read_members", organization.id);
  const rows = await db.prepare(
    `SELECT organization_id, user_id, user_name, user_email, role, status, created_at, updated_at
     FROM organization_memberships
     WHERE organization_id = ? AND status = 'active'
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'administrator' THEN 1 ELSE 2 END, lower(COALESCE(user_name, user_email, user_id))`,
  ).bind(organization.id).all<Record<string, unknown>>();
  return rows.results || [];
}

export async function saveOrganizationMember(
  db: D1Database,
  organizationId: string,
  actor: OrganizationActor,
  payload: Record<string, unknown>,
  now: string,
) {
  const organization = await requireOrganization(db, organizationId);
  await authorizeOrganization(db, actor, "manage", organization.id);
  const userId = String(payload.user_id || "").trim();
  const role = String(payload.role || "member").trim().toLowerCase();
  if (!userId) fail(400, "user_id is required");
  if (role !== "member" && role !== "administrator") fail(400, "role must be member or administrator");
  const ownership = await activeOwnership(db, organization.id);
  if (ownership?.owner_user_id === userId) fail(400, "The current owner's role cannot be changed here");
  const userName = String(payload.user_name || "").trim().slice(0, 255) || null;
  const userEmail = String(payload.user_email || "").trim().toLowerCase().slice(0, 320) || null;
  await db.batch([
    db.prepare(
      `INSERT INTO organization_memberships
        (organization_id, user_id, user_name, user_email, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT(organization_id, user_id) DO UPDATE SET
         user_name = excluded.user_name,
         user_email = excluded.user_email,
         role = excluded.role,
         status = 'active',
         updated_at = excluded.updated_at`,
    ).bind(organization.id, userId, userName, userEmail, role, now, now),
    auditStatement(db, actor.id, "organization.membership.saved", "organization", organization.id, userId, { role }, now),
  ]);
  return { organization_id: organization.id, user_id: userId, user_name: userName, user_email: userEmail, role, status: "active", updated_at: now };
}

export async function createOwnershipChallenge(
  db: D1Database,
  organizationId: string,
  actor: OrganizationActor,
  payload: Record<string, unknown>,
  now: string,
) {
  const organization = await requireOrganization(db, organizationId);
  await authorizeOrganization(db, actor, "challenge", organization.id);
  const ownership = await activeOwnership(db, organization.id);
  if (!ownership) fail(400, "Unclaimed organizations must be claimed directly");
  if (ownership.owner_user_id === actor.id) fail(400, "The current owner cannot challenge their own ownership");
  const explanation = String(payload.explanation || "").trim();
  if (!explanation || explanation.length > 4000) fail(400, "A challenge explanation is required");
  const evidence = parseEvidence(payload.evidence);
  const existing = await db.prepare(
    "SELECT * FROM organization_ownership_challenges WHERE organization_id = ? AND challenger_user_id = ? AND status = 'open'",
  ).bind(organization.id, actor.id).first<ChallengeRow>();
  if (existing) return mapChallenge(existing, []);

  const challengeId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      `INSERT INTO organization_ownership_challenges
        (id, organization_id, ownership_id, challenger_user_id, challenger_name, challenger_email,
         explanation, evidence_json, status, resolution, resolved_by_user_id, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?, NULL)`,
    ).bind(challengeId, organization.id, ownership.id, actor.id, actor.name, actor.email, explanation, JSON.stringify(evidence), now),
    auditStatement(db, actor.id, "organization.ownership_challenged", "organization", organization.id, ownership.owner_user_id, { challenge_id: challengeId }, now),
  ]);
  return mapChallenge({
    id: challengeId,
    organization_id: organization.id,
    ownership_id: ownership.id,
    challenger_user_id: actor.id,
    challenger_name: actor.name,
    challenger_email: actor.email,
    explanation,
    evidence_json: JSON.stringify(evidence),
    status: "open",
    resolution: null,
    resolved_by_user_id: null,
    created_at: now,
    resolved_at: null,
    organization_name: organization.name,
    organization_slug: organization.slug,
    owner_user_id: ownership.owner_user_id,
  }, []);
}

function mapChallenge(row: ChallengeRow, support: Array<Record<string, unknown>>) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    organization_name: row.organization_name || null,
    organization_slug: row.organization_slug || null,
    ownership_id: row.ownership_id,
    owner_user_id: row.owner_user_id || null,
    challenger_user_id: row.challenger_user_id,
    challenger_name: row.challenger_name,
    challenger_email: row.challenger_email,
    explanation: row.explanation,
    evidence: parseJsonArray(row.evidence_json),
    status: row.status,
    resolution: row.resolution,
    resolved_by_user_id: row.resolved_by_user_id,
    support,
    incumbent_support_count: support.filter((item) => item.position === "incumbent").length,
    challenger_support_count: support.filter((item) => item.position === "challenger").length,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
  };
}

export async function listOwnershipChallenges(
  db: D1Database,
  actor: OrganizationActor,
  options: { organizationId?: string; status?: string; operatorQueue?: boolean } = {},
) {
  if (options.operatorQueue && !actor.isOperator) fail(403, "Operator access required");
  const filters: string[] = [];
  const binds: unknown[] = [];
  if (options.organizationId) {
    const organization = await requireOrganization(db, options.organizationId);
    filters.push("c.organization_id = ?");
    binds.push(organization.id);
  }
  if (options.status === "open" || options.status === "withdrawn" || options.status === "resolved") {
    filters.push("c.status = ?");
    binds.push(options.status);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await db.prepare(
    `SELECT c.*, o.name AS organization_name, o.slug AS organization_slug, own.owner_user_id
     FROM organization_ownership_challenges c
     JOIN organizations o ON o.id = c.organization_id
     JOIN organization_ownerships own ON own.id = c.ownership_id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT 500`,
  ).bind(...binds).all<ChallengeRow>();
  return Promise.all((rows.results || []).map(async (row) => {
    const support = await db.prepare(
      "SELECT user_id, user_name, position, created_at FROM organization_ownership_challenge_support WHERE challenge_id = ? ORDER BY created_at",
    ).bind(row.id).all<Record<string, unknown>>();
    return mapChallenge(row, support.results || []);
  }));
}

async function requireChallenge(db: D1Database, challengeId: string) {
  const row = await db.prepare(
    `SELECT c.*, o.name AS organization_name, o.slug AS organization_slug, own.owner_user_id
     FROM organization_ownership_challenges c
     JOIN organizations o ON o.id = c.organization_id
     JOIN organization_ownerships own ON own.id = c.ownership_id
     WHERE c.id = ?`,
  ).bind(challengeId).first<ChallengeRow>();
  if (!row) fail(404, "Ownership challenge not found");
  return row;
}

export async function supportOwnershipChallenge(
  db: D1Database,
  challengeId: string,
  actor: OrganizationActor,
  position: unknown,
  now: string,
) {
  const challenge = await requireChallenge(db, challengeId);
  if (challenge.status !== "open") fail(409, "Ownership challenge is closed");
  const normalized = String(position || "").trim().toLowerCase();
  if (normalized !== "incumbent" && normalized !== "challenger") fail(400, "position must be incumbent or challenger");
  await db.batch([
    db.prepare(
      `INSERT INTO organization_ownership_challenge_support
        (challenge_id, user_id, user_name, position, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(challenge_id, user_id) DO UPDATE SET
         user_name = excluded.user_name,
         position = excluded.position,
         created_at = excluded.created_at`,
    ).bind(challenge.id, actor.id, actor.name, normalized, now),
    auditStatement(db, actor.id, "organization.challenge_supported", "ownership_challenge", challenge.id, challenge.challenger_user_id, { position: normalized }, now),
  ]);
  return { challenge_id: challenge.id, user_id: actor.id, user_name: actor.name, position: normalized, created_at: now };
}

export async function withdrawOwnershipChallenge(db: D1Database, challengeId: string, actor: OrganizationActor, now: string) {
  const challenge = await requireChallenge(db, challengeId);
  if (challenge.status !== "open") fail(409, "Ownership challenge is closed");
  if (challenge.challenger_user_id !== actor.id && !actor.isOperator) fail(403, "Only the challenger may withdraw this challenge");
  await db.batch([
    db.prepare("UPDATE organization_ownership_challenges SET status = 'withdrawn', resolved_by_user_id = ?, resolved_at = ? WHERE id = ? AND status = 'open'")
      .bind(actor.id, now, challenge.id),
    auditStatement(db, actor.id, "organization.challenge_withdrawn", "ownership_challenge", challenge.id, challenge.challenger_user_id, {}, now),
  ]);
  return { id: challenge.id, status: "withdrawn", resolved_at: now };
}

export async function resolveOwnershipChallenge(
  db: D1Database,
  challengeId: string,
  actor: OrganizationActor,
  decision: unknown,
  now: string,
  allowOwnerAcceptance = false,
) {
  const challenge = await requireChallenge(db, challengeId);
  if (challenge.status !== "open") fail(409, "Ownership challenge is closed");
  const normalized = String(decision || "").trim().toLowerCase();
  if (normalized !== "incumbent" && normalized !== "challenger") fail(400, "decision must be incumbent or challenger");
  const currentOwnership = await activeOwnership(db, challenge.organization_id);
  if (!currentOwnership || currentOwnership.id !== challenge.ownership_id) fail(409, "The challenged ownership is no longer active");
  const ownerAccepts = allowOwnerAcceptance && currentOwnership.owner_user_id === actor.id && normalized === "challenger";
  if (!actor.isOperator && !ownerAccepts) fail(403, "Operator access required");

  const statements: D1PreparedStatement[] = [
    db.prepare(
      "UPDATE organization_ownership_challenges SET status = 'resolved', resolution = ?, resolved_by_user_id = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
    ).bind(normalized, actor.id, now, challenge.id),
  ];
  if (normalized === "challenger") {
    const newOwnershipId = crypto.randomUUID();
    statements.push(
      db.prepare("UPDATE organization_ownerships SET status = 'transferred', ended_at = ? WHERE id = ? AND status = 'active'")
        .bind(now, currentOwnership.id),
      db.prepare(
        `INSERT INTO organization_ownerships
          (id, organization_id, owner_user_id, status, started_at, ended_at)
         VALUES (?, ?, ?, 'active', ?, NULL)`,
      ).bind(newOwnershipId, challenge.organization_id, challenge.challenger_user_id, now),
      db.prepare(
        "UPDATE organization_memberships SET role = 'member', updated_at = ? WHERE organization_id = ? AND user_id = ?",
      ).bind(now, challenge.organization_id, currentOwnership.owner_user_id),
      db.prepare(
        `INSERT INTO organization_memberships
          (organization_id, user_id, user_name, user_email, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)
         ON CONFLICT(organization_id, user_id) DO UPDATE SET
           user_name = excluded.user_name,
           user_email = excluded.user_email,
           role = 'owner',
           status = 'active',
           updated_at = excluded.updated_at`,
      ).bind(challenge.organization_id, challenge.challenger_user_id, challenge.challenger_name, challenge.challenger_email, now, now),
      db.prepare(
        `UPDATE organization_ownership_challenges
         SET status = 'resolved', resolution = 'incumbent', resolved_by_user_id = ?, resolved_at = ?
         WHERE organization_id = ? AND status = 'open' AND id <> ?`,
      ).bind(actor.id, now, challenge.organization_id, challenge.id),
    );
  }
  statements.push(auditStatement(
    db,
    actor.id,
    normalized === "challenger" ? "organization.ownership_transferred" : "organization.challenge_resolved",
    "organization",
    challenge.organization_id,
    normalized === "challenger" ? challenge.challenger_user_id : currentOwnership.owner_user_id,
    { challenge_id: challenge.id, decision: normalized, previous_owner_user_id: currentOwnership.owner_user_id },
    now,
  ));
  await db.batch(statements);
  return { id: challenge.id, status: "resolved", resolution: normalized, resolved_by_user_id: actor.id, resolved_at: now };
}

export async function listAuditEvents(db: D1Database, actor: OrganizationActor, limit: number) {
  if (!actor.isOperator) fail(403, "Operator access required");
  const rows = await db.prepare(
    `SELECT id, actor_user_id, action, resource_type, resource_id, subject_user_id, metadata_json, created_at
     FROM audit_events ORDER BY created_at DESC LIMIT ?`,
  ).bind(limit).all<Record<string, unknown> & { metadata_json: string }>();
  return (rows.results || []).map((row) => {
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(row.metadata_json || "{}") as Record<string, unknown>; } catch { metadata = {}; }
    const { metadata_json: _metadataJson, ...rest } = row;
    return { ...rest, metadata };
  });
}
