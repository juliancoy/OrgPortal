import { snapshotEtagMatches } from './organizationReplication';

// A content signature lets public graph feeds revalidate without retransmitting
// unchanged pages. Only use this for explicitly public, session-independent data.
export async function publicDataResponse(request: Request, data: unknown) {
  const body = JSON.stringify(data);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const etag = '"' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') + '"';
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ETag: etag };
  const unchanged = snapshotEtagMatches(request.headers.get('If-None-Match'), etag);
  return new Response(unchanged ? null : body, { status: unchanged ? 304 : 200, headers });
}
