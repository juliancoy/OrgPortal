/** Public organization metadata only. Identity and authorization never replicate. */
export interface ReplicaEnv {
  DB: D1Database;
  ORGANIZATION_REPLICA_SOURCE?: string;
  ORGANIZATION_REPLICA_INTERVAL_SECONDS?: string;
}
const columns = {
  organizations: ['id','name','slug','description','source_url','image_url','tags','city','created_at','updated_at','media_json'],
  organization_support_records: ['id','from_organization_id','to_organization_id','from_label','to_label','support_kind','amount','currency','amount_label','quantity','unit','description','occurred_at','source_url','evidence','notes','provenance_json','status','void_reason','created_at'],
} as const;
export function snapshotEtagMatches(header: string | null | undefined, etag: string | null) {
  const normalize=(s:string)=>s.trim().replace(/^W\//, "");
  return !!etag && !!header && header.split(",").some(s=>s.trim()==="*" || normalize(s)===normalize(etag));
}
export async function organizationSnapshot(db: D1Database, request: Request) {
  // D1 batch is transactional: organizations and evidence describe one committed state.
  const rows = await db.batch(Object.entries(columns).map(([table, fields]) => db.prepare(`SELECT ${fields.join(',')} FROM ${table} ORDER BY id`)));
  const body = JSON.stringify({version:1,organizations:rows[0].results,support:rows[1].results});
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const etag = `"${hash}"`;
  const headers = {'ETag':etag,'Cache-Control':'public, max-age=60','Content-Type':'application/json'};
  return new Response(snapshotEtagMatches(request.headers.get('If-None-Match'),etag) ? null : body,{status:snapshotEtagMatches(request.headers.get('If-None-Match'),etag) ? 304 : 200,headers});
}
export async function replicaStatus(env: ReplicaEnv) {
  if (!env.ORGANIZATION_REPLICA_SOURCE) return {mode:'primary'};
  const state = await env.DB.prepare('SELECT * FROM organization_replica_state WHERE id=1').first<any>();
  const interval = replicaInterval(env);
  return {mode:'replica',source:env.ORGANIZATION_REPLICA_SOURCE,intervalSeconds:interval,...state,stale:!state?.checked_at || Date.now()-Date.parse(state.checked_at)>interval*3000};
}
function replicaInterval(env: ReplicaEnv) {
  const seconds=Number(env.ORGANIZATION_REPLICA_INTERVAL_SECONDS || 300);
  if (!Number.isFinite(seconds) || seconds<60 || seconds>86400) throw new Error('Replica interval must be between 60 and 86400 seconds');
  return seconds;
}
function validateRows(rows: unknown, table: keyof typeof columns): asserts rows is Record<string,unknown>[] {
  if (!Array.isArray(rows)) throw new Error('Incomplete snapshot');
  const ids=new Set();
  for (const row of rows) {
    if (!row || typeof row.id!=='string' || !row.id || ids.has(row.id) || columns[table].some(c=>!(c in row))) throw new Error('Invalid snapshot row');
    ids.add(row.id);
  }
}
export async function replicateOrganizations(env: ReplicaEnv, fetcher: typeof fetch = fetch) {
  if (!env.ORGANIZATION_REPLICA_SOURCE) return;
  const source=new URL(env.ORGANIZATION_REPLICA_SOURCE);
  if (source.protocol!=='https:' && !['localhost','127.0.0.1'].includes(source.hostname)) throw new Error('Replica source requires HTTPS');
  const previous=await env.DB.prepare('SELECT * FROM organization_replica_state WHERE id=1').first<any>();
  if (previous && previous.source!==source.href) throw new Error('Replica source changed: use a separate database for another primary');
  if (previous?.checked_at && Date.now()-Date.parse(previous.checked_at)<replicaInterval(env)*1000) return;
  try {
    const response=await fetcher(source.href,{headers:previous?.etag?{'If-None-Match':previous.etag}:{},signal:AbortSignal.timeout(30000),redirect:'error'});
    const now=new Date().toISOString();
    if (response.status===304 && previous?.etag) {
      await env.DB.prepare('UPDATE organization_replica_state SET checked_at=?,error=NULL WHERE id=1').bind(now).run();
      return;
    }
    if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
    const body=await response.text();
    if (body.length>8*1024*1024) throw new Error('Snapshot exceeds 8 MiB; retain last successful data');
    const snapshot=JSON.parse(body);
    if (snapshot.version!==1) throw new Error('Unsupported snapshot version');
    validateRows(snapshot.organizations,'organizations');validateRows(snapshot.support,'organization_support_records');
    const orgs=JSON.stringify(snapshot.organizations),support=JSON.stringify(snapshot.support);
    const statements:D1PreparedStatement[]=[];
    for (const [table, data] of [['organizations',orgs],['organization_support_records',support]] as const) {
      const fields=columns[table];
      statements.push(env.DB.prepare(`INSERT INTO ${table} (${fields.join(',')}) SELECT ${fields.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET ${fields.filter(c=>c!=='id').map(c=>`${c}=excluded.${c}`).join(',')}`).bind(data));
    }
    statements.push(env.DB.prepare("DELETE FROM organization_support_records WHERE id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(support));
    statements.push(env.DB.prepare("DELETE FROM organization_source_identities WHERE organization_id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(orgs));
    statements.push(env.DB.prepare("DELETE FROM organizations WHERE id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(orgs));
    statements.push(env.DB.prepare('INSERT INTO organization_replica_state (id,source,etag,checked_at,applied_at,organization_count,support_count,error) VALUES (1,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET etag=excluded.etag,checked_at=excluded.checked_at,applied_at=excluded.applied_at,organization_count=excluded.organization_count,support_count=excluded.support_count,error=NULL').bind(source.href,response.headers.get('ETag'),now,now,snapshot.organizations.length,snapshot.support.length));
    await env.DB.batch(statements);
  } catch (error) {
    const message=error instanceof Error?error.message:'Replication failed';
    await env.DB.prepare('INSERT INTO organization_replica_state (id,source,error) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET error=excluded.error').bind(source.href,message).run();
    throw error;
  }
}
