import type { PushDeliveryJob } from './push';

type Outbox = {id:string;payload_json:string|null;expires_at:string;lease_token:string|null;lease_until:string|null;completed_at:string|null};
const iso = (value:number) => new Date(value).toISOString();

export async function persistPush(db:D1Database, job:PushDeliveryJob, createdAt=Date.now()) {
  const payload=JSON.stringify(job);
  if (!job.eventId || (!job.userId && !job.subscriptionId) || new TextEncoder().encode(payload).length>32768 || !Number.isFinite(createdAt))
    throw new Error('Invalid push job');
  const identity=JSON.stringify([job.eventId,job.userId||null,job.subscriptionId||null]);
  const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity))),b=>b.toString(16).padStart(2,'0')).join('');
  await db.prepare(`INSERT OR IGNORE INTO push_outbox
    (id,user_id,subscription_id,payload_json,created_at,expires_at,retire_at,next_attempt_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(id,job.userId||null,job.subscriptionId||null,payload,iso(createdAt),iso(createdAt+23*3600000),iso(createdAt+7*86400000),iso(createdAt)).run();
  return id;
}

export async function finishPush(db:D1Database,id:string,token:string|null=null) {
  await db.prepare(`UPDATE push_outbox SET payload_json=NULL,user_id=NULL,subscription_id=NULL,
    completed_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND (? IS NULL OR lease_token=?)`)
    .bind(iso(Date.now()),id,token,token).run();
}

export async function claimPush(db:D1Database,id:string) {
  const now=Date.now(),token=crypto.randomUUID();
  const row=await db.prepare(`UPDATE push_outbox SET lease_token=?,lease_until=? WHERE id=?
    AND payload_json IS NOT NULL AND expires_at>? AND (lease_until IS NULL OR lease_until<=?) RETURNING payload_json`)
    .bind(token,iso(now+300000),id,iso(now),iso(now)).first<{payload_json:string}>();
  if (row) return {token,job:JSON.parse(row.payload_json) as PushDeliveryJob};
  const existing=await db.prepare('SELECT payload_json,expires_at FROM push_outbox WHERE id=?').bind(id).first<Outbox>();
  if (existing?.payload_json && existing.expires_at<=iso(now)) await finishPush(db,id);
  return {token:null,job:null,busy:!!existing?.payload_json && existing.expires_at>iso(now)};
}

export async function renewPush(db:D1Database,id:string,token:string) {
  const result=await db.prepare('UPDATE push_outbox SET lease_until=? WHERE id=? AND lease_token=? AND payload_json IS NOT NULL')
    .bind(iso(Date.now()+300000),id,token).run();
  if (result.meta.changes!==1) throw new Error('Push lease lost');
}

export async function retryPush(db:D1Database,id:string,token:string) {
  await db.prepare('UPDATE push_outbox SET lease_token=NULL,lease_until=NULL,next_attempt_at=? WHERE id=? AND lease_token=?')
    .bind(iso(Date.now()+30000),id,token).run();
}

export async function sendPushOutbox(env:Env,id:string) {
  if (!env.PUSH_QUEUE || env.ORGANIZATION_REPLICA_SOURCE) return;
  const now=Date.now();
  const row=await env.DB.prepare(`SELECT payload_json FROM push_outbox WHERE id=? AND payload_json IS NOT NULL
    AND expires_at>? AND (lease_until IS NULL OR lease_until<=?)`).bind(id,iso(now),iso(now)).first<{payload_json:string}>();
  if (!row) return;
  // A crash after this update delays another attempt; the original payload stays durable.
  await env.DB.prepare('UPDATE push_outbox SET next_attempt_at=? WHERE id=?').bind(iso(now+300000),id).run();
  try { await env.PUSH_QUEUE.send(JSON.parse(row.payload_json) as PushDeliveryJob); }
  catch (error) {
    await env.DB.prepare('UPDATE push_outbox SET next_attempt_at=? WHERE id=? AND payload_json IS NOT NULL').bind(iso(now+60000),id).run();
    throw error;
  }
}

export async function dispatchPushOutbox(env:Env) {
  if (!env.PUSH_QUEUE || env.ORGANIZATION_REPLICA_SOURCE) return {queued:0,failed:0};
  const rows=await env.DB.prepare(`SELECT id FROM push_outbox WHERE payload_json IS NOT NULL AND expires_at>?
    AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY next_attempt_at,id LIMIT 100`)
    .bind(iso(Date.now()),iso(Date.now()),iso(Date.now())).all<{id:string}>();
  let queued=0,failed=0;
  for (const row of rows.results) {
    try { await sendPushOutbox(env,row.id); queued++; } catch { failed++; }
  }
  return {queued,failed};
}

export async function expirePushOutbox(db:D1Database,now:number,dryRun=false) {
  if (dryRun) return (await db.prepare('SELECT count(*) AS n FROM push_outbox WHERE payload_json IS NOT NULL AND expires_at<=?').bind(iso(now)).first<{n:number}>())?.n||0;
  const result=await db.prepare(`UPDATE push_outbox SET payload_json=NULL,user_id=NULL,subscription_id=NULL,completed_at=?,lease_token=NULL,lease_until=NULL
    WHERE id IN (SELECT id FROM push_outbox WHERE payload_json IS NOT NULL AND expires_at<=? ORDER BY expires_at LIMIT 500)`)
    .bind(iso(now),iso(now)).run();
  await db.prepare('DELETE FROM push_outbox WHERE id IN (SELECT id FROM push_outbox WHERE payload_json IS NULL AND retire_at<=? ORDER BY retire_at LIMIT 500)').bind(iso(now)).run();
  return result.meta.changes;
}
