import { z } from 'zod';
import { EventIntegrationError } from '../eventPlatforms';

export const directorySearchSchema = z.object({
  query: z.string().trim().max(200).default(''),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(3000).optional(),
}).strict();
export const directoryTargetSchema = z.object({ organizationId: z.string().min(1).max(200) }).strict();
const cursorSchema = z.object({ name: z.string().max(255), id: z.string().max(200), query: z.string().max(200) }).strict();
const fields = `o.id,o.slug,o.name,o.description,o.source_url,o.image_url,o.city,o.tags,o.updated_at,
  EXISTS(SELECT 1 FROM organization_ownerships own WHERE own.organization_id=o.id AND own.status='active') AS claimed`;
type DirectoryRow = { id: string; slug: string; name: string; description: string | null; source_url: string | null;
  image_url: string | null; city: string | null; tags: string; updated_at: string; claimed: number };
function publicOrganization(row: DirectoryRow) {
  let tags: string[] = [];
  try { const parsed: unknown = JSON.parse(row.tags || '[]'); if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string'); } catch { /* Older imports may contain malformed tags. */ }
  const { claimed, ...record } = row;
  return { ...record, tags, ownershipStatus: claimed ? 'claimed' : 'unclaimed', verificationStatus: 'not_recorded' };
}
function encodeCursor(value: z.infer<typeof cursorSchema>) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function decodeCursor(value: string, query: string) {
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0)));
    const cursor = cursorSchema.parse(JSON.parse(decoded));
    if (cursor.query !== query) throw new Error();
    return cursor;
  } catch { throw new EventIntegrationError(400, 'Invalid directory cursor; restart the search'); }
}

// Public directory projections never include member identities or permission grants.
export async function searchOrganizationDirectory(db: D1Database, input: unknown) {
  const args = directorySearchSchema.parse(input);
  const cursor = args.cursor ? decodeCursor(args.cursor, args.query) : null;
  const pattern = `%${args.query.replace(/[\\%_]/g, character => `\\${character}`)}%`;
  const rows = await db.prepare(`SELECT ${fields} FROM organizations o
    WHERE (?='' OR o.name LIKE ? ESCAPE '\\' OR o.source_url LIKE ? ESCAPE '\\' OR o.city LIKE ? ESCAPE '\\')
    AND (? IS NULL OR (lower(o.name),o.id) > (lower(?),?))
    ORDER BY lower(o.name),o.id LIMIT ?`)
    .bind(args.query, pattern, pattern, pattern, cursor?.id ?? null, cursor?.name ?? null, cursor?.id ?? null, args.limit + 1).all<DirectoryRow>();
  const page = rows.results.slice(0, args.limit);
  const last = page.at(-1);
  return { organizations: page.map(publicOrganization), nextCursor: rows.results.length > args.limit && last
    ? encodeCursor({ name: last.name, id: last.id, query: args.query }) : null };
}
export async function getDirectoryOrganization(db: D1Database, input: unknown) {
  const { organizationId } = directoryTargetSchema.parse(input);
  const row = await db.prepare(`SELECT ${fields} FROM organizations o WHERE o.id=? OR o.slug=?`)
    .bind(organizationId, organizationId).first<DirectoryRow>();
  if (!row) throw new EventIntegrationError(404, 'Directory organization not found');
  return { organization: publicOrganization(row) };
}
