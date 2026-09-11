import { TimebankError } from './timebank';

type Claimant = { id: string; name: string; email: string };
type Claim = { id: string; account_id: string; claimant_user_id: string; evidence: string; status: string };
function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TimebankError('Provide a JSON object.');
  return body as Record<string, unknown>;
}
function text(input: Record<string, unknown>, key: string, max: number) {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new TimebankError(`${key} must contain 1 to ${max} characters.`);
  return value.trim();
}
function uuid(input: Record<string, unknown>) {
  const id = text(input, 'id', 36);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw new TimebankError('Provide a valid request ID.');
  return id;
}

export async function importClaimDirectory(db: D1Database, userId: string, communityId: string, query = '') {
  if (query.length > 100) throw new TimebankError('Search must be at most 100 characters.');
  // Names and source handles are sufficient for discovery. Balances, contact
  // details, evidence, and private records are never returned by this endpoint.
  const accounts = await db.prepare(`SELECT a.id, a.name, a.source_slug, b.source_name,
      a.claimed_by_user_id IS NOT NULL AS claimed, a.claimed_by_user_id = ? AS claimed_by_me
    FROM timebank_import_accounts a JOIN timebank_import_batches b ON b.id = a.batch_id
    WHERE a.community_id = ? AND b.ready = 1
      AND (instr(lower(a.name), lower(?)) > 0 OR instr(lower(a.source_slug), lower(?)) > 0)
    ORDER BY lower(a.name), a.id LIMIT 100`).bind(userId, communityId, query.trim(), query.trim()).all();
  const claims = await db.prepare(`SELECT c.id, c.account_id, c.status, c.evidence, c.created_at, c.review_note, a.name
    FROM timebank_import_claims c JOIN timebank_import_accounts a ON a.id = c.account_id
    WHERE c.community_id = ? AND c.claimant_user_id = ? ORDER BY c.created_at DESC LIMIT 100`).bind(communityId, userId).all();
  return { accounts: accounts.results, claims: claims.results };
}

export async function requestImportClaim(db: D1Database, member: Claimant, communityId: string, body: unknown) {
  const input = object(body), id = uuid(input), accountId = text(input, 'account_id', 36), evidence = text(input, 'evidence', 1000);
  const existing = await db.prepare('SELECT * FROM timebank_import_claims WHERE id = ? AND community_id = ?').bind(id, communityId).first<Claim>();
  if (existing) {
    if (existing.claimant_user_id !== member.id || existing.account_id !== accountId || existing.evidence !== evidence) throw new TimebankError('This request ID is already in use.', 409);
    return { id: existing.id, status: existing.status };
  }
  await db.prepare('INSERT INTO timebank_members (user_id, name) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING').bind(member.id, member.name).run();
  try {
    await db.prepare(`INSERT INTO timebank_import_claims
      (id, community_id, account_id, claimant_user_id, claimant_name, claimant_email, evidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, communityId, accountId, member.id, member.name, member.email, evidence, new Date().toISOString()).run();
  } catch (error) {
    if (error instanceof Error && /constraint|not available|unique/i.test(error.message)) throw new TimebankError('You already have a pending or approved claim, or this account is unavailable. Refresh your claims.', 409);
    throw error;
  }
  return { id, status: 'pending' };
}

export async function withdrawImportClaim(db: D1Database, userId: string, communityId: string, id: string) {
  await db.prepare(`UPDATE timebank_import_claims SET status = 'withdrawn', reviewed_at = ?, reviewer_user_id = ?, review_note = 'Withdrawn by claimant.'
    WHERE id = ? AND community_id = ? AND claimant_user_id = ? AND status = 'pending'`).bind(new Date().toISOString(), userId, id, communityId, userId).run();
  const row = await db.prepare('SELECT status FROM timebank_import_claims WHERE id = ? AND community_id = ? AND claimant_user_id = ?').bind(id, communityId, userId).first<{ status: string }>();
  if (!row) throw new TimebankError('Claim not found.', 404);
  if (row.status !== 'withdrawn') throw new TimebankError('This claim has already been reviewed.', 409);
  return row;
}

export async function reviewImportClaims(db: D1Database, communityId: string) {
  const claims = await db.prepare(`SELECT c.*, a.name AS account_name, a.source_profile_url, a.balance_minutes,
      b.source_name FROM timebank_import_claims c JOIN timebank_import_accounts a ON a.id = c.account_id
      JOIN timebank_import_batches b ON b.id = a.batch_id
    WHERE c.community_id = ? AND b.ready = 1 ORDER BY (c.status = 'pending') DESC, c.created_at DESC LIMIT 200`).bind(communityId).all();
  const batches = await db.prepare(`SELECT b.source_name, b.captured_at, b.expected_records AS record_count,
      COUNT(a.id) AS account_count, COUNT(a.balance_minutes) AS known_balances,
      SUM(a.claimed_by_user_id IS NOT NULL) AS claimed_accounts
    FROM timebank_import_batches b JOIN timebank_import_accounts a ON a.batch_id = b.id
    WHERE b.community_id = ? AND b.ready = 1 GROUP BY b.id`).bind(communityId).all();
  return { claims: claims.results, batches: batches.results };
}

export async function resolveImportClaim(db: D1Database, reviewerId: string, communityId: string, id: string, body: unknown) {
  const input = object(body), status = input.status, note = text(input, 'review_note', 1000);
  if (status !== 'approved' && status !== 'rejected') throw new TimebankError('Choose approve or reject.');
  const existing = await db.prepare('SELECT * FROM timebank_import_claims WHERE id = ? AND community_id = ?').bind(id, communityId).first<Claim>();
  if (!existing) throw new TimebankError('Claim not found.', 404);
  if (status === 'approved' && existing.claimant_user_id === reviewerId) throw new TimebankError('Another administrator must review your own claim.', 403);
  if (existing.status === status) return { id, status };
  if (existing.status !== 'pending') throw new TimebankError('This claim has already been reviewed.', 409);
  try {
    // A database trigger atomically assigns ownership, resolves competing
    // claims, and appends audit entries. No cached balance is incremented.
    await db.prepare(`UPDATE timebank_import_claims SET status = ?, reviewed_at = ?, reviewer_user_id = ?, review_note = ?
      WHERE id = ? AND community_id = ? AND status = 'pending'`).bind(status, new Date().toISOString(), reviewerId, note, id, communityId).run();
  } catch (error) {
    if (error instanceof Error && /constraint|already claimed|unique/i.test(error.message)) throw new TimebankError('This account or member already has an approved claim.', 409);
    throw error;
  }
  const actual = await db.prepare('SELECT status FROM timebank_import_claims WHERE id = ? AND community_id = ?').bind(id, communityId).first<{ status: string }>();
  if (actual?.status !== status) throw new TimebankError('Another review resolved this claim. Refresh and try again.', 409);
  return { id, status };
}

export async function claimedImportRecords(db: D1Database, userId: string, communityId: string) {
  const account = await db.prepare(`SELECT a.id, a.name, a.source_profile_url, a.balance_minutes,
      a.earned_minutes, a.spent_minutes, a.received_minutes, a.donated_minutes, a.profile_json, b.source_name, b.captured_at
    FROM timebank_import_accounts a JOIN timebank_import_batches b ON b.id = a.batch_id
    WHERE a.community_id = ? AND a.claimed_by_user_id = ? AND b.ready = 1`).bind(communityId, userId).first<{ id: string; profile_json: string; [key: string]: unknown }>();
  if (!account) return { account: null, records: [] };
  const records = await db.prepare(`SELECT r.id, r.kind, r.title, r.source_url, r.payload_json, link.relationship
    FROM timebank_import_records r JOIN timebank_import_record_accounts link ON link.record_id = r.id
    WHERE link.account_id = ? ORDER BY r.kind DESC, r.id`).bind(account.id).all<{ payload_json: string; [key: string]: unknown }>();
  const { profile_json, ...fields } = account;
  return { account: { ...fields, profile: JSON.parse(profile_json) as unknown }, records: records.results.map(({ payload_json, ...record }) => ({ ...record, detail: JSON.parse(payload_json) as unknown })) };
}


// The source catalog contains public-safe advertised offers and requests. Source
// balances, evidence, and private ledgers stay on the authenticated claim routes.
export async function importedListings(db: D1Database, userId: string | null, communityId: string) {
  const rows = await db.prepare(`SELECT r.id, r.title, r.source_url, r.payload_json, b.source_name, b.captured_at,
      a.claimed_by_user_id AS claimed_user_id, COALESCE(m.name, a.name) AS claimed_user_name,
      (? IS NOT NULL AND a.claimed_by_user_id = ?) AS claimed_by_me
    FROM timebank_import_records r JOIN timebank_import_batches b ON b.id = r.batch_id
    LEFT JOIN timebank_import_record_accounts link ON link.record_id = r.id AND link.relationship = 'owner'
    LEFT JOIN timebank_import_accounts a ON a.id = link.account_id
    LEFT JOIN timebank_members m ON m.user_id = a.claimed_by_user_id
    WHERE b.community_id = ? AND b.ready = 1 AND r.kind = 'activity'
      AND json_extract(r.payload_json, '$.advertised') = 1
      AND json_extract(r.payload_json, '$.activity_type') IN ('Offer', 'Request')
    ORDER BY r.title, r.id LIMIT 200`).bind(userId, userId, communityId).all<{payload_json: string; [key: string]: unknown}>();
  return rows.results.map(({payload_json, ...row}) => {
    const detail = JSON.parse(payload_json);
    return {...row, kind: detail.activity_type.toLowerCase(), description: detail.text,
      owner_name: detail.owner_name, image_id: detail.image_id, date_display: detail.date_display};
  });
}
export async function importedListingImage(env: Env, userId: string | null, communityId: string, recordId: string) {
  const row = await env.DB.prepare(`SELECT asset.object_key, asset.content_type FROM timebank_import_records r
    JOIN timebank_import_batches b ON b.id = r.batch_id
    JOIN timebank_import_assets asset ON asset.id = json_extract(r.payload_json, '$.image_id') AND asset.batch_id = b.id
    WHERE r.id = ? AND b.community_id = ? AND b.ready = 1 AND r.kind = 'activity'
      AND (json_extract(r.payload_json, '$.advertised') = 1 OR EXISTS (
        SELECT 1 FROM timebank_import_record_accounts link JOIN timebank_import_accounts a ON a.id = link.account_id
        WHERE link.record_id = r.id AND ? IS NOT NULL AND a.claimed_by_user_id = ?))`).bind(recordId, communityId, userId, userId).first<{object_key: string; content_type: string}>();
  if (!row) throw new TimebankError('Imported photo not found.', 404);
  const photo = await env.SCAN_IMAGES?.get(row.object_key);
  if (!photo) throw new TimebankError('Imported photo not found.', 404);
  return new Response(photo.body, { headers: { 'Content-Type': row.content_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
