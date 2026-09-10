export class TimebankError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 = 400) {
    super(message);
  }
}

export type Community = { id: string; hostname: string; name: string; tagline: string; accent_color: string };
export type PortalTenant = Community & {
  profile: string;
  features: string[];
  public_base_url?: string | null;
  canonical_path_prefix?: string | null;
  feature_config?: string | null;
};
const DEFAULT_COMMUNITY = 'code-collective';
export const TIMEBANK_CATEGORIES = ['Home & garden', 'Learning', 'Tech help', 'Care & company', 'Transport', 'Creative', 'Other'] as const;

type Member = { id: string; name: string };
type Listing = {
  id: string;
  user_id: string;
  kind: 'offer' | 'request';
  title: string;
  description: string;
  location: string;
  minutes: number;
  status: 'open' | 'closed';
  created_at: string;
  community_id: string;
  image_key: string | null;
  category: string;
  contact: string;
  visibility: 'public' | 'members';
};
type Exchange = {
  id: string;
  listing_id: string;
  provider_user_id: string;
  recipient_user_id: string;
  proposed_by_user_id: string;
  minutes: number;
  note: string;
  status: 'pending' | 'confirmed' | 'declined' | 'canceled';
  created_at: string;
  resolved_at: string | null;
  community_id: string;
};

function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TimebankError('Provide a JSON object.');
  }
  return value as Record<string, unknown>;
}

function textField(input: Record<string, unknown>, key: string, max: number, optional = false) {
  const value = input[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || (!optional && !value.trim())) {
    throw new TimebankError(`${key} must be ${optional ? 'at most' : 'between 1 and'} ${max} characters.`);
  }
  return value.trim();
}

function requestId(input: Record<string, unknown>) {
  const id = textField(input, 'id', 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new TimebankError('Provide a valid request ID.');
  }
  return id;
}

function minutesField(input: Record<string, unknown>) {
  const minutes = input.minutes;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 15 || minutes > 1440 || minutes % 15 !== 0) {
    throw new TimebankError('Choose 0.25 to 24 hours in quarter-hour increments.');
  }
  return minutes;
}

async function ensureMember(db: D1Database, member: Member) {
  const contactId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO timebank_members (user_id, name) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET name = excluded.name`).bind(member.id, member.name),
    // Native messaging resolves recipients through the shared directory. A
    // private contact makes new timebank members reachable without publishing
    // their profile or creating a Dena account.
    db.prepare(`INSERT INTO user_contact_pages (id, user_id, user_name, slug, enabled)
      VALUES (?, ?, ?, ?, 0) ON CONFLICT(user_id) DO NOTHING`)
      .bind(contactId, member.id, member.name, `member-${contactId}`),
  ]);
}

export async function timebankDashboard(db: D1Database, member: Member | null, communityId = DEFAULT_COMMUNITY, requestSort = 'most', mineOnly = false) {
  if (!['most', 'least', 'newest'].includes(requestSort)) throw new TimebankError('Choose most taken up, least taken up, or newest.');
  if (mineOnly && !member) throw new TimebankError('Sign in to view your listings.', 403);
  if (member) await ensureMember(db, member);
  const userId = member?.id ?? null;
  const [totals, listings, exchanges] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN provider_user_id = ? THEN minutes ELSE 0 END), 0) AS earned_minutes,
      COALESCE(SUM(CASE WHEN recipient_user_id = ? THEN minutes ELSE 0 END), 0) AS spent_minutes
      FROM timebank_exchanges WHERE community_id = ? AND status = 'confirmed'
      AND (provider_user_id = ? OR recipient_user_id = ?)`)
      .bind(userId, userId, communityId, userId, userId),
    db.prepare(`WITH participants AS (
        SELECT listing_id, user_id FROM timebank_uptakes WHERE community_id = ?
        UNION
        SELECT e.listing_id, e.provider_user_id FROM timebank_exchanges e
        JOIN timebank_listings l ON l.id = e.listing_id AND l.community_id = e.community_id
        WHERE e.community_id = ? AND e.status = 'confirmed' AND l.kind = 'request'
      ), uptake AS (
        SELECT listing_id, COUNT(*) AS uptake_count, MAX(user_id = ?) AS user_has_taken_up
        FROM participants GROUP BY listing_id
      ), board AS (
        SELECT l.*, m.name AS member_name, COALESCE(u.uptake_count, 0) AS uptake_count,
          COALESCE(u.user_has_taken_up, 0) AS user_has_taken_up,
          EXISTS(SELECT 1 FROM timebank_exchanges e WHERE e.listing_id = l.id
            AND e.community_id = l.community_id AND e.status = 'confirmed' AND e.provider_user_id = ?) AS user_has_helped
        FROM timebank_listings l JOIN timebank_members m ON m.user_id = l.user_id
        LEFT JOIN uptake u ON u.listing_id = l.id
        WHERE l.community_id = ? AND (l.status = 'open' OR l.user_id = ?)
          AND (? IS NOT NULL OR l.visibility = 'public')
          AND (? = 0 OR l.user_id = ?)
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY kind ORDER BY
          CASE WHEN kind = 'request' AND ? = 'most' THEN uptake_count END DESC,
          CASE WHEN kind = 'request' AND ? = 'least' THEN uptake_count END ASC,
          created_at DESC, id DESC) AS board_rank FROM board
      ) SELECT * FROM ranked WHERE ? = 1 OR board_rank <= 200 ORDER BY kind, board_rank`)
      .bind(communityId, communityId, userId, userId, communityId, userId, userId,
        mineOnly ? 1 : 0, userId, requestSort, requestSort, mineOnly ? 1 : 0),
    db.prepare(`SELECT e.*, l.title AS listing_title, p.name AS provider_name, r.name AS recipient_name
      FROM timebank_exchanges e JOIN timebank_listings l ON l.id = e.listing_id
      JOIN timebank_members p ON p.user_id = e.provider_user_id
      JOIN timebank_members r ON r.user_id = e.recipient_user_id
      WHERE e.community_id = ? AND (e.provider_user_id = ? OR e.recipient_user_id = ?)
      ORDER BY (e.status = 'pending') DESC, COALESCE(e.resolved_at, e.created_at) DESC, e.id DESC LIMIT 100`)
      .bind(communityId, userId, userId),
  ]);
  const earned = Number(totals.results[0]?.earned_minutes || 0);
  const spent = Number(totals.results[0]?.spent_minutes || 0);
  return {
    account: member ? { user_id: member.id, name: member.name, balance_minutes: earned - spent, earned_minutes: earned, spent_minutes: spent } : null,
    listings: listings.results,
    exchanges: exchanges.results,
  };
}

// The main website showcases public offers across communities. The portal's
// own boards, member data and mutations remain scoped to their community.
export async function publicTimebankOffers(db: D1Database, before?: string) {
  const [date, id, extra] = (before || '').split('|');
  if (before && (before.length > 100 || extra !== undefined || !id || !Number.isFinite(Date.parse(date)))) {
    throw new TimebankError('Invalid offers cursor.');
  }
  const pageSize = 12;
  const rows = await db.prepare(`SELECT l.id, l.title, l.description, l.location, l.minutes,
      l.category, l.created_at, l.image_key, m.name AS member_name,
      c.name AS community_name, c.hostname AS community_hostname
    FROM timebank_listings l JOIN timebank_members m ON m.user_id = l.user_id
    JOIN timebank_communities c ON c.id = l.community_id
    WHERE l.kind = 'offer' AND l.status = 'open' AND l.visibility = 'public'
      AND (? IS NULL OR l.created_at < ? OR (l.created_at = ? AND l.id < ?))
    ORDER BY l.created_at DESC, l.id DESC LIMIT ?`)
    .bind(date || null, date || null, date || null, id || null, pageSize + 1)
    .all<{ id: string; title: string; description: string; location: string; minutes: number;
      category: string; created_at: string; image_key: string | null; member_name: string;
      community_name: string; community_hostname: string }>();
  return {
    items: rows.results.slice(0, pageSize).map(({ image_key, community_hostname, ...listing }) => ({
      ...listing,
      url: `https://${community_hostname}${community_hostname === 'codecollective.us' ? '/p' : ''}/timebanking?listing=${encodeURIComponent(listing.id)}`,
      image_url: image_key ? `https://${community_hostname}/api/org/api/timebank/listings/${encodeURIComponent(listing.id)}/image?v=${encodeURIComponent(image_key)}` : null,
    })),
    next_cursor: rows.results.length > pageSize ? `${rows.results[pageSize - 1].created_at}|${rows.results[pageSize - 1].id}` : null,
  };
}

export async function createTimebankListing(db: D1Database, member: Member, body: unknown, communityId = DEFAULT_COMMUNITY) {
  const input = inputObject(body);
  const id = requestId(input);
  if (input.kind !== 'offer' && input.kind !== 'request') throw new TimebankError('Choose an offer or a request.');
  const kind = input.kind;
  const title = textField(input, 'title', 120);
  const description = textField(input, 'description', 2000);
  const location = textField(input, 'location', 160, true);
  const contact = textField(input, 'contact', 300, true);
  const category = textField(input, 'category', 40, true) || 'Other';
  const visibility = input.visibility === undefined ? 'public' : input.visibility;
  if (visibility !== 'public' && visibility !== 'members') throw new TimebankError('Choose public or members only.');
  if (!(TIMEBANK_CATEGORIES as readonly string[]).includes(category)) throw new TimebankError('Choose a category.');
  const minutes = minutesField(input);
  await ensureMember(db, member);
  await db.prepare(`INSERT INTO timebank_listings (id, user_id, kind, title, description, location, minutes, created_at, community_id, category, contact, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(id, member.id, kind, title, description, location, minutes, new Date().toISOString(), communityId, category, contact, visibility).run();
  const row = await db.prepare('SELECT * FROM timebank_listings WHERE id = ? AND community_id = ?').bind(id, communityId).first<Listing>();
  if (!row || row.user_id !== member.id || row.kind !== kind || row.title !== title || row.description !== description || row.location !== location || row.minutes !== minutes || row.category !== category || row.contact !== contact || row.visibility !== visibility) {
    throw new TimebankError('This request ID has already been used. Refresh and try again.', 409);
  }
  return row;
}

export async function updateTimebankListing(db: D1Database, userId: string, id: string, body: unknown, communityId = DEFAULT_COMMUNITY) {
  const input = inputObject(body);
  if (input.status === undefined && input.visibility === undefined) throw new TimebankError('Choose a status or visibility.');
  if (input.status !== undefined && input.status !== 'open' && input.status !== 'closed') throw new TimebankError('Choose open or closed.');
  if (input.visibility !== undefined && input.visibility !== 'public' && input.visibility !== 'members') throw new TimebankError('Choose public or members only.');
  const result = await db.prepare(`UPDATE timebank_listings SET status = COALESCE(?, status), visibility = COALESCE(?, visibility)
    WHERE id = ? AND user_id = ? AND community_id = ?`)
    .bind(input.status ?? null, input.visibility ?? null, id, userId, communityId).run();
  if (!result.meta.changes) throw new TimebankError('Listing not found or not owned by you.', 404);
  return { id, status: input.status, visibility: input.visibility };
}

export async function proposeTimebankExchange(db: D1Database, member: Member, body: unknown, communityId = DEFAULT_COMMUNITY) {
  const input = inputObject(body);
  const id = requestId(input);
  const listingId = textField(input, 'listing_id', 36);
  const minutes = minutesField(input);
  const note = textField(input, 'note', 1000);
  await ensureMember(db, member);
  // Derive both participants from the authenticated member and the listing.
  // Checking availability in the INSERT also handles a simultaneous close.
  await db.prepare(`INSERT INTO timebank_exchanges
    (id, listing_id, provider_user_id, recipient_user_id, proposed_by_user_id, minutes, note, created_at, community_id)
    SELECT ?, id, CASE WHEN kind = 'offer' THEN user_id ELSE ? END,
      CASE WHEN kind = 'request' THEN user_id ELSE ? END, ?, ?, ?, ?, community_id
    FROM timebank_listings WHERE id = ? AND community_id = ? AND status = 'open' AND user_id <> ?
    ON CONFLICT(id) DO NOTHING`)
    .bind(id, member.id, member.id, member.id, minutes, note, new Date().toISOString(), listingId, communityId, member.id).run();
  const row = await db.prepare('SELECT * FROM timebank_exchanges WHERE id = ? AND community_id = ?').bind(id, communityId).first<Exchange>();
  if (!row) throw new TimebankError('Choose an open listing from another member.', 409);
  if (row.proposed_by_user_id !== member.id || row.listing_id !== listingId || row.minutes !== minutes || row.note !== note) {
    throw new TimebankError('This request ID has already been used. Refresh and try again.', 409);
  }
  return row;
}

export async function resolveTimebankExchange(db: D1Database, userId: string, id: string, body: unknown, communityId = DEFAULT_COMMUNITY) {
  const input = inputObject(body);
  const status = input.status;
  if (status !== 'confirmed' && status !== 'declined' && status !== 'canceled') {
    throw new TimebankError('Choose confirmed, declined, or canceled.');
  }
  const exchange = await db.prepare('SELECT * FROM timebank_exchanges WHERE id = ? AND community_id = ?').bind(id, communityId).first<Exchange>();
  if (!exchange || (exchange.provider_user_id !== userId && exchange.recipient_user_id !== userId)) {
    throw new TimebankError('Exchange not found.', 404);
  }
  const isProposer = exchange.proposed_by_user_id === userId;
  if ((status === 'canceled') !== isProposer) {
    throw new TimebankError('Only the other participant can confirm or decline hours; the submitter can cancel.', 403);
  }
  if (exchange.status === status) return exchange;
  // A single conditional write posts both sides of the ledger exactly once.
  const result = await db.prepare(`UPDATE timebank_exchanges SET status = ?, resolved_at = ?
    WHERE id = ? AND community_id = ? AND status = 'pending'`).bind(status, new Date().toISOString(), id, communityId).run();
  if (!result.meta.changes) throw new TimebankError('This exchange has already been resolved.', 409);
  return db.prepare('SELECT * FROM timebank_exchanges WHERE id = ? AND community_id = ?').bind(id, communityId).first<Exchange>();
}

export async function resolveTimebankCommunity(db: D1Database, request: Request) {
  // The site proxy replaces this header. Communities are open to shared portal
  // identities; hostname selects the board and ledger, not admin privileges.
  const host = (request.headers.get('x-forwarded-host') || new URL(request.url).host).toLowerCase().split(':')[0];
  const defaults = ['localhost', '127.0.0.1', 'www.codecollective.us', 'org-codecollective.jcloiacon.workers.dev', 'codecollective-site.jcloiacon.workers.dev'];
  const hostname = defaults.includes(host) ? 'codecollective.us' : host;
  const row = await db.prepare('SELECT * FROM timebank_communities WHERE hostname = ?').bind(hostname).first<Community>();
  if (!row) throw new TimebankError('This timebank community has not been configured.', 404);
  return row;
}

function requestHostname(request: Request) {
  const host = (request.headers.get('x-forwarded-host') || new URL(request.url).host).toLowerCase().split(':')[0];
  const defaults = ['localhost', '127.0.0.1', 'www.codecollective.us', 'org-codecollective.jcloiacon.workers.dev', 'codecollective-site.jcloiacon.workers.dev'];
  return defaults.includes(host) ? 'codecollective.us' : host;
}

function tenantFeatures(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function resolvePortalTenant(db: D1Database, request: Request): Promise<PortalTenant> {
  const hostname = requestHostname(request);
  try {
    const tenant = await db.prepare('SELECT * FROM portal_tenants WHERE hostname = ?').bind(hostname).first<Community & { profile: string; features: string; public_base_url?: string | null; canonical_path_prefix?: string | null; feature_config?: string | null }>();
    if (tenant) return { ...tenant, features: tenantFeatures(tenant.features) };
  } catch {
    // Older local databases may not have the tenant table yet.
  }
  const community = await resolveTimebankCommunity(db, request);
  return { ...community, profile: 'community', features: ['timebank'] };
}

export async function saveTimebankCommunity(db: D1Database, id: string, body: unknown) {
  const input = inputObject(body);
  if (!/^[a-z][a-z0-9-]{2,39}$/.test(id) || id.endsWith('-')) throw new TimebankError('Use 3–40 lowercase letters, numbers or hyphens for the subdomain.');
  if (['www', 'id', 'pidp', 'api', 'mail', 'dev', 'portal', 'chat', 'org', 'admin'].includes(id)) throw new TimebankError('That subdomain is reserved.');
  const name = textField(input, 'name', 80);
  const tagline = textField(input, 'tagline', 180);
  const accent = textField(input, 'accent_color', 7);
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new TimebankError('Choose a valid accent color.');
  const hostname = id === DEFAULT_COMMUNITY ? 'codecollective.us' : `${id}.codecollective.us`;
  await db.prepare(`INSERT INTO timebank_communities (id, hostname, name, tagline, accent_color) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, tagline = excluded.tagline, accent_color = excluded.accent_color`)
    .bind(id, hostname, name, tagline, accent).run();
  await db.prepare(`INSERT INTO portal_tenants (id, hostname, name, tagline, accent_color, profile, features) VALUES (?, ?, ?, ?, ?, 'community', '["timebank"]')
    ON CONFLICT(id) DO UPDATE SET hostname = excluded.hostname, name = excluded.name, tagline = excluded.tagline,
      accent_color = excluded.accent_color, profile = excluded.profile, features = excluded.features, updated_at = CURRENT_TIMESTAMP`)
    .bind(id, hostname, name, tagline, accent).run();
  return db.prepare('SELECT * FROM timebank_communities WHERE id = ?').bind(id).first<Community>();
}

const PHOTO_LIMIT = 5 * 1024 * 1024;
async function readPhoto(request: Request) {
  if (Number(request.headers.get('content-length')) > PHOTO_LIMIT) throw new TimebankError('Choose a photo smaller than 5 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new TimebankError('Choose a photo.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > PHOTO_LIMIT) { await reader.cancel(); throw new TimebankError('Choose a photo smaller than 5 MB.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const signature = (start: number, values: number[]) => values.every((value, i) => bytes[start + i] === value);
  const type = signature(0, [255, 216, 255]) ? 'image/jpeg'
    : signature(0, [137, 80, 78, 71, 13, 10, 26, 10]) ? 'image/png'
    : signature(0, [82, 73, 70, 70]) && signature(8, [87, 69, 66, 80]) ? 'image/webp' : '';
  if (!type || type !== request.headers.get('content-type')?.split(';')[0]) throw new TimebankError('Choose a JPEG, PNG or WebP photo.');
  return { bytes, type };
}

export async function setTimebankPhoto(db: D1Database, bucket: R2Bucket | undefined, communityId: string, userId: string, id: string, request: Request) {
  const listing = await db.prepare('SELECT * FROM timebank_listings WHERE id = ? AND community_id = ? AND user_id = ?')
    .bind(id, communityId, userId).first<Listing>();
  if (!listing) throw new TimebankError('Listing not found or not owned by you.', 404);
  if (!bucket) throw new Error('Photo storage is unavailable.');
  const photo = request.method === 'DELETE' ? null : await readPhoto(request);
  const key = photo ? `timebank/${communityId}/${id}/${crypto.randomUUID()}` : null;
  if (photo && key) await bucket.put(key, photo.bytes, { httpMetadata: { contentType: photo.type, cacheControl: 'private, max-age=300' } });
  try {
    await db.prepare('UPDATE timebank_listings SET image_key = ? WHERE id = ? AND community_id = ? AND user_id = ?')
      .bind(key, id, communityId, userId).run();
  } catch (error) {
    if (key) await bucket.delete(key);
    throw error;
  }
  if (listing.image_key) await bucket.delete(listing.image_key);
  return { image_key: key };
}

export async function getTimebankPhoto(db: D1Database, bucket: R2Bucket | undefined, communityId: string, id: string, userId: string | null = null) {
  const row = await db.prepare(`SELECT image_key FROM timebank_listings WHERE id = ? AND community_id = ?
    AND (? IS NOT NULL OR (visibility = 'public' AND status = 'open'))`).bind(id, communityId, userId).first<{ image_key: string | null }>();
  const object = row?.image_key && bucket ? await bucket.get(row.image_key) : null;
  if (!object) throw new TimebankError('Photo not found.', 404);
  const headers = new Headers({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'private, max-age=300' });
  object.writeHttpMetadata(headers);
  // Recheck visibility on every read, including after an owner restricts a public photo.
  headers.set('Cache-Control', 'private, no-store');
  headers.set('ETag', object.httpEtag);
  return new Response(object.body, { headers });
}

// Taking up a request records a commitment, not an hours transfer. Confirmed
// providers remain in the distinct-participant count even after withdrawing.
export async function setTimebankUptake(db: D1Database, member: Member, listingId: string, active: boolean, communityId: string) {
  const listing = await db.prepare('SELECT id, user_id, kind, status FROM timebank_listings WHERE id = ? AND community_id = ?')
    .bind(listingId, communityId).first<Listing>();
  if (!listing) throw new TimebankError('Request not found.', 404);
  if (listing.kind !== 'request' || listing.user_id === member.id) throw new TimebankError('Choose a request from another member.', 409);
  if (active) {
    if (listing.status !== 'open') throw new TimebankError('This request is closed.', 409);
    await ensureMember(db, member);
    const result = await db.prepare(`INSERT INTO timebank_uptakes (listing_id, user_id, community_id, created_at)
      SELECT id, ?, community_id, ? FROM timebank_listings
      WHERE id = ? AND community_id = ? AND kind = 'request' AND status = 'open' AND user_id <> ?
      ON CONFLICT(listing_id, user_id) DO UPDATE SET user_id = excluded.user_id`)
      .bind(member.id, new Date().toISOString(), listingId, communityId, member.id).run();
    if (!result.meta.changes) throw new TimebankError('This request is closed.', 409);
  } else {
    await db.prepare('DELETE FROM timebank_uptakes WHERE listing_id = ? AND user_id = ? AND community_id = ?')
      .bind(listingId, member.id, communityId).run();
  }
  return { active };
}

export async function timebankAnalytics(db: D1Database, communityId: string) {
  const [totals, circulation, categories, beneficiaries, providers] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT COALESCE(SUM(minutes), 0) AS rewarded_minutes, COUNT(*) AS confirmed_exchanges
      FROM timebank_exchanges WHERE community_id = ? AND status = 'confirmed'`).bind(communityId),
    db.prepare(`WITH entries AS (
        SELECT provider_user_id AS user_id, minutes FROM timebank_exchanges WHERE community_id = ? AND status = 'confirmed'
        UNION ALL
        SELECT recipient_user_id AS user_id, -minutes FROM timebank_exchanges WHERE community_id = ? AND status = 'confirmed'
      ), balances AS (SELECT user_id, SUM(minutes) AS minutes FROM entries GROUP BY user_id)
      SELECT COALESCE(SUM(minutes), 0) AS circulation_minutes FROM balances WHERE minutes > 0`).bind(communityId, communityId),
    db.prepare(`SELECT l.category, SUM(e.minutes) AS minutes FROM timebank_exchanges e
      JOIN timebank_listings l ON l.id = e.listing_id AND l.community_id = e.community_id
      WHERE e.community_id = ? AND e.status = 'confirmed' GROUP BY l.category ORDER BY minutes DESC, l.category`).bind(communityId),
    db.prepare(`SELECT m.user_id, m.name, SUM(e.minutes) AS minutes FROM timebank_exchanges e
      JOIN timebank_members m ON m.user_id = e.recipient_user_id
      WHERE e.community_id = ? AND e.status = 'confirmed' GROUP BY m.user_id, m.name
      ORDER BY minutes DESC, m.name, m.user_id LIMIT 10`).bind(communityId),
    db.prepare(`SELECT m.user_id, m.name, SUM(e.minutes) AS minutes FROM timebank_exchanges e
      JOIN timebank_members m ON m.user_id = e.provider_user_id
      WHERE e.community_id = ? AND e.status = 'confirmed' GROUP BY m.user_id, m.name
      ORDER BY minutes DESC, m.name, m.user_id LIMIT 10`).bind(communityId),
  ]);
  return { ...totals.results[0], ...circulation.results[0], categories: categories.results,
    beneficiaries: beneficiaries.results, providers: providers.results };
}


export async function getTimebankListing(db: D1Database, userId: string | null, communityId: string, id: string) {
  const row = await db.prepare(`SELECT l.*, m.name AS member_name,
    (SELECT COUNT(*) FROM (
      SELECT u.user_id FROM timebank_uptakes u WHERE u.listing_id = l.id AND u.community_id = l.community_id
      UNION SELECT e.provider_user_id FROM timebank_exchanges e WHERE e.listing_id = l.id
        AND e.community_id = l.community_id AND e.status = 'confirmed' AND l.kind = 'request'
    )) AS uptake_count,
    EXISTS(SELECT 1 FROM timebank_uptakes u WHERE u.listing_id = l.id AND u.user_id = ?) AS user_has_taken_up,
    EXISTS(SELECT 1 FROM timebank_exchanges e WHERE e.listing_id = l.id AND e.provider_user_id = ? AND e.status = 'confirmed') AS user_has_helped
    FROM timebank_listings l JOIN timebank_members m ON m.user_id = l.user_id
    WHERE l.id = ? AND l.community_id = ?
      AND (? IS NOT NULL OR (l.visibility = 'public' AND l.status = 'open'))`).bind(userId, userId, id, communityId, userId).first();
  if (!row) throw new TimebankError('Listing not found in this community.', 404);
  return row;
}
