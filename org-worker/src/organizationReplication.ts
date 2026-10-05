/** Public organization metadata only. Identity and authorization never replicate. */
export interface ReplicaEnv {
  DB: D1Database;
  ORGANIZATION_REPLICA_SOURCE?: string;
  ORGANIZATION_REPLICA_INTERVAL_SECONDS?: string;
}
const columns = {
  organizations: ['id','name','slug','description','source_url','image_url','tags','city','created_at','updated_at','media_json'],
  organization_support_records: ['id','from_organization_id','to_organization_id','from_label','to_label','support_kind','amount','currency','amount_label','quantity','unit','description','occurred_at','source_url','evidence','notes','provenance_json','status','void_reason','created_at'],
  financing_recipients: ['id','name','organization_id','metadata_json','updated_at'],
  financing_agency_recipients: ['id','agency_id','recipient_id','research_json','audit_json','reviewed_at','updated_at'],
  financing_events: ['id','recipient_id','agency_id','event_type','amount','currency','amount_qualifier','occurred_at','label','investors_json','sources_json','notes','included_in_event_id','updated_at'],
} as const;
export function snapshotEtagMatches(header: string | null | undefined, etag: string | null) {
  const normalize=(s:string)=>s.trim().replace(/^W\//, "");
  return !!etag && !!header && header.split(",").some(s=>s.trim()==="*" || normalize(s)===normalize(etag));
}
export async function organizationSnapshot(db: D1Database, request: Request) {
  // D1 batch is transactional: organizations and evidence describe one committed state.
  const rows = await db.batch(Object.entries(columns).map(([table, fields]) => db.prepare(`SELECT ${fields.join(',')} FROM ${table} ORDER BY id`)));
  const body = JSON.stringify({version:2,organizations:rows[0].results,support:rows[1].results,financingRecipients:rows[2].results,financingAgencies:rows[3].results,financingEvents:rows[4].results});
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
    const response=await fetcher(source.href,{headers:previous?.etag?{'If-None-Match':previous.etag}:{},signal:AbortSignal.timeout(30000),redirect:'manual'});
    const now=new Date().toISOString();
    if (response.status===304 && previous?.etag) {
      await env.DB.prepare('UPDATE organization_replica_state SET checked_at=?,error=NULL WHERE id=1').bind(now).run();
      return;
    }
    if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
    const body=await response.text();
    if (body.length>8*1024*1024) throw new Error('Snapshot exceeds 8 MiB; retain last successful data');
    const snapshot=JSON.parse(body);
    if (snapshot.version!==2) throw new Error('Unsupported snapshot version');
    validateRows(snapshot.organizations,'organizations');validateRows(snapshot.support,'organization_support_records');
    validateRows(snapshot.financingRecipients,'financing_recipients'); validateRows(snapshot.financingAgencies,'financing_agency_recipients'); validateRows(snapshot.financingEvents,'financing_events');
    const orgs=JSON.stringify(snapshot.organizations),support=JSON.stringify(snapshot.support);
    const remaps = (await env.DB.prepare("SELECT o.id AS old_id,json_extract(r.value,'$.id') AS new_id FROM organizations o JOIN json_each(?) r ON o.slug=json_extract(r.value,'$.slug') WHERE o.id!=json_extract(r.value,'$.id') AND o.id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(orgs,orgs).all<{old_id:string;new_id:string}>()).results || [];
    const statements:D1PreparedStatement[]=[
      env.DB.prepare('DELETE FROM financing_events'),
      env.DB.prepare('DELETE FROM financing_agency_recipients'),
      env.DB.prepare('DELETE FROM financing_recipients'),
      env.DB.prepare('DELETE FROM organization_support_records'),
      // Stage unique slugs within this transaction to allow renames and swaps.
      env.DB.prepare("UPDATE organizations SET slug=? || id").bind('__replica_stage_'+crypto.randomUUID()+'_'),
    ];
    function upsert(table: keyof typeof columns, data: string) {
      const fields=columns[table];
      return env.DB.prepare(`INSERT INTO ${table} (${fields.join(',')}) SELECT ${fields.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET ${fields.filter(c=>c!=='id').map(c=>`${c}=excluded.${c}`).join(',')}`).bind(data);
    }
    statements.push(upsert('organizations',orgs));
    if (remaps.length) {
      // Seeded local IDs can differ for the same organization slug. Repoint local
      // references after the primary ID exists, before pruning the seeded row.
      const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
      const tables=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>()).results || [];
      const mapping=JSON.stringify(remaps);
      for (const table of tables) {
        if (table.name==='organization_support_records' || table.name.startsWith('_cf_') || table.name.startsWith('sqlite_')) continue;
        const keys=(await env.DB.prepare(`PRAGMA foreign_key_list(${quote(table.name)})`).all<{table:string;from:string}>()).results || [];
        if (table.name==='portal_tenants') {
          const fields=(await env.DB.prepare('PRAGMA table_info(portal_tenants)').all<{name:string}>()).results || [];
          if (fields.some(f=>f.name==='organization_id')) keys.push({table:'organizations',from:'organization_id'});
        }
        for (const fk of keys.filter(k=>k.table==='organizations')) {
          const col=quote(fk.from);
          statements.push(env.DB.prepare(`UPDATE ${quote(table.name)} SET ${col}=(SELECT json_extract(value,'$.new_id') FROM json_each(?) WHERE json_extract(value,'$.old_id')=${quote(table.name)}.${col}) WHERE ${col} IN (SELECT json_extract(value,'$.old_id') FROM json_each(?))`).bind(mapping,mapping));
        }
      }
    }
    statements.push(env.DB.prepare("DELETE FROM organization_source_identities WHERE organization_id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(orgs));
    statements.push(env.DB.prepare("DELETE FROM organizations WHERE id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(orgs));
    statements.push(upsert('organization_support_records',support));
    statements.push(upsert('financing_recipients',JSON.stringify(snapshot.financingRecipients)));
    statements.push(upsert('financing_agency_recipients',JSON.stringify(snapshot.financingAgencies)));
    statements.push(upsert('financing_events',JSON.stringify(snapshot.financingEvents)));
    statements.push(env.DB.prepare('INSERT INTO organization_replica_state (id,source,etag,checked_at,applied_at,organization_count,support_count,error) VALUES (1,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET etag=excluded.etag,checked_at=excluded.checked_at,applied_at=excluded.applied_at,organization_count=excluded.organization_count,support_count=excluded.support_count,error=NULL').bind(source.href,response.headers.get('ETag'),now,now,snapshot.organizations.length,snapshot.support.length));
    statements.push(env.DB.prepare('UPDATE organization_replica_state SET financing_count=? WHERE id=1').bind(snapshot.financingEvents.length));
    await env.DB.batch(statements);
  } catch (error) {
    const message=error instanceof Error?error.message:'Replication failed';
    await env.DB.prepare('INSERT INTO organization_replica_state (id,source,error) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET error=excluded.error').bind(source.href,message).run();
    throw error;
  }
}
