#!/usr/bin/env node
// Private, repeatable snapshot loader. No source archive belongs in this repo.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync, mkdirSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const SOURCE = 'https://letsbmore.timebanks.org';
const stamp = () => new Date().toISOString();
const json = (value) => JSON.stringify(value);
export const stableId = (value) => {
  const h = createHash('sha1').update(`codecollective:letsbmore:${value}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
};
export function minutes(value) {
  if (value === undefined || value === null || value === '') return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) throw new Error('Invalid source credit amount');
  const scale = 10n ** BigInt((match[3] || '').length);
  const amount = BigInt(match[2] + (match[3] || '')) * 60n;
  if (amount % scale) throw new Error('Source credits do not resolve to whole minutes');
  const result = Number(amount / scale) * (match[1] ? -1 : 1);
  if (!Number.isSafeInteger(result)) throw new Error('Source amount is too large');
  return result;
}
function sourceUrl(value, kind) {
  const u = new URL(value);
  if (u.origin !== SOURCE || !u.pathname.startsWith(`/${kind}/`) || u.search || /\/(?:copy|edit|delete|end_activity|bestmatch)\//.test(u.pathname)) throw new Error('Unexpected source URL');
  return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
}
export function buildSnapshot(archivePath, community = 'bmoretimebank') {
  if (community !== 'bmoretimebank') throw new Error('This import is scoped to bmoretimebank');
  const archive = realpathSync(archivePath);
  const names = ['data/hour-balances.json','data/members.json','data/activities.json','data/account.json','data/your-exchange-history.json','coverage.json','live-verification.json','assets-manifest.json'];
  const hash = createHash('sha256');
  const input = Object.fromEntries(names.map((name) => { const bytes = readFileSync(resolve(archive,name)); hash.update(name).update(bytes); return [name,JSON.parse(bytes)]; }));
  const coverage = input['coverage.json'], live = input['live-verification.json'];
  if (!coverage.authenticated || !coverage.all_advertised_activity_ids_present || !live.deleted_copy_ids_absent || !live.restored_live_ids_present) throw new Error('Source coverage or repair verification is incomplete');
  const captured = live.checked_at;
  if (!Number.isFinite(Date.parse(captured))) throw new Error('Missing capture timestamp');
  const sourceKey = `letsbmore:${captured}`;
  const batchId = stableId(`${community}:${sourceKey}`);
  const balances = input['data/hour-balances.json'];
  const profiles = new Map(input['data/members.json'].filter((p) => /^https:\/\/letsbmore\.timebanks\.org\/profile\/[^/?]+\/?$/.test(p.url)).map((p) => [sourceUrl(p.url,'profile'),p]));
  const accounts = balances.map((row) => {
    const url = sourceUrl(row.profile_url,'profile');
    const profile = profiles.get(url);
    if (!profile || !row.name?.trim()) throw new Error('A balance has no matching profile');
    const about = (profile.text.split('\nAbout\n')[1] || '').split(/\n(?:My activities|Activities|Badges|Interests)\n/)[0].slice(0,5000);
    return { id:stableId(`${batchId}:${url}`), batch_id:batchId, community_id:community, source_profile_url:url, source_slug:url.split('/').pop(), name:row.name.trim(),
      balance_minutes:row.balance_visible ? minutes(row.balance_credits) : null,
      earned_minutes:row.balance_visible ? minutes(row.earned_credits) : null,
      spent_minutes:row.balance_visible ? minutes(row.spent_credits) : null,
      received_minutes:row.balance_visible ? minutes(row.received_credits) : null,
      donated_minutes:row.balance_visible ? minutes(row.donated_credits) : null,
      profile_json:json({text:about, in_member_directory:Boolean(row.in_member_directory)}) };
  });
  const byProfile = new Map(accounts.map((a) => [a.source_profile_url,a]));
  if (byProfile.size !== accounts.length || accounts.length !== coverage.member_directory.member_profiles_exported || accounts.filter((a) => a.balance_minutes !== null).length !== coverage.member_directory.profiles_with_visible_balances) throw new Error('Profile or balance count mismatch');
  const assets = Object.entries(input['assets-manifest.json']).filter(([,a]) => a.status === 200).map(([url,a]) => {
    const file = realpathSync(resolve(archive,a.file));
    if (!file.startsWith(archive+sep) || !['image/jpeg','image/png','image/webp'].includes(a.content_type)) throw new Error('Unsafe asset path or content type');
    const bytes = readFileSync(file);
    if (bytes.length !== a.bytes || createHash('sha256').update(bytes).digest('hex') !== a.sha256) throw new Error('Asset checksum mismatch');
    return { id:stableId(`${batchId}:asset:${url}`),batch_id:batchId,source_url:url,object_key:`timebank-imports/${batchId}/${a.sha256}`,content_type:a.content_type,byte_size:a.bytes,sha256:a.sha256,file };
  });
  if (assets.length !== coverage.downloaded_assets) throw new Error('Asset count mismatch');
  const byAsset = new Map(assets.map((a) => [a.source_url,a.id]));
  const liveIds = new Set(live.activity_ids.map(String));
  if (liveIds.size !== live.live_activity_count || liveIds.size !== coverage.current_activity_list_total) throw new Error('Advertised activity count mismatch');
  const links = [];
  const records = input['data/activities.json'].map((row) => {
    const url = sourceUrl(row.url,'activity'), id = stableId(`${batchId}:activity:${url}`);
    const ownerUrls = [...new Set(row.links.filter((u) => /^https:\/\/letsbmore\.timebanks\.org\/profile\/[^/?]+\/?$/.test(u)).map((u) => sourceUrl(u,'profile')))];
    if (ownerUrls.length > 1) throw new Error('Ambiguous activity owner');
    const owner = byProfile.get(ownerUrls[0]);
    if (owner) links.push({record_id:id,account_id:owner.id,batch_id:batchId,relationship:'owner'});
    const advertised = liveIds.has(String(row.id));
    return { id,batch_id:batchId,kind:'activity',source_url:url,title:row.title,
      payload_json:json({activity_type:row.activity_type,text:row.description || '',status:advertised ? 'advertised at capture' : /Please note this activity has ended\./.test(row.text) ? 'ended' : 'archived',advertised,
        source_id:String(row.id),owner_name:owner?.name || 'Former member',owner_account_id:owner?.id || null,
        date_display:row.added_date_display || row.text.match(/\non ([^\n]+)/)?.[1] || '',
        categories:Array.isArray(row.details) ? row.details : [],image_id:byAsset.get(row.metadata?.['og:image']) || byAsset.get(row.metadata?.['twitter:image']) || null}) };
  });
  if (records.length !== coverage.activity_records || new Set(records.map((r) => r.source_url)).size !== records.length || records.filter((r) => JSON.parse(r.payload_json).advertised).length !== liveIds.size) throw new Error('Activity coverage mismatch');
  const dashboard = input['data/account.json'].find((p) => p.url === SOURCE+'/dashboard');
  const selfUrls = [...new Set((dashboard?.links || []).filter((u) => /^https:\/\/letsbmore\.timebanks\.org\/profile\/[^/?]+\/?$/.test(u)).map((u) => sourceUrl(u,'profile')))];
  const self = byProfile.get(selfUrls[0]);
  if (selfUrls.length !== 1 || !self) throw new Error('Cannot establish the exporting account');
  const history = input['data/your-exchange-history.json'];
  for (const row of history) {
    const url = sourceUrl(row.activity_url,'activity'), id = stableId(`${batchId}:transaction:${url}`);
    records.push({id,batch_id:batchId,kind:'transaction',source_url:url,title:row.title,
      payload_json:json({minutes:minutes(row.hours),status:'completed',text:(row.history_details || []).map((d) => `${d.label}\n${d.entries.join('\n')}`).join('\n\n'),source_account:self.source_profile_url})});
    // Only the exporting account's ledger was available. Do not infer counterparties.
    links.push({record_id:id,account_id:self.id,batch_id:batchId,relationship:'source_account'});
  }
  if (history.length !== coverage.your_account.your_completed_exchange_records || history.reduce((sum,r) => sum+minutes(r.hours),0) !== minutes(coverage.your_account.your_exported_exchange_hours) || self.balance_minutes !== minutes(coverage.your_account.your_balance.balance_credits)) throw new Error('Source ledger reconciliation failed');
  if (new Set(records.map((r) => r.id)).size !== records.length) throw new Error('Duplicate source records');
  const batch = {id:batchId,community_id:community,source_key:sourceKey,source_name:'LetsBMore TimeBank',source_url:SOURCE,source_sha256:hash.digest('hex'),captured_at:captured,imported_at:stamp(),expected_accounts:accounts.length,expected_records:records.length,expected_links:links.length,expected_assets:assets.length};
  return {batch,accounts,records,links,assets,summary:{accounts:accounts.length,known_balances:accounts.filter((a) => a.balance_minutes !== null).length,source_balance_minutes:accounts.reduce((s,a) => s+(a.balance_minutes || 0),0),activities:records.length-history.length,advertised_activities:liveIds.size,transactions:history.length,assets:assets.length,record_links:links.length}};
}
const insert = (table,row,conflict='ON CONFLICT DO NOTHING') => ({sql:`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')}) ${conflict}`,params:Object.values(row)});
export function statements(snapshot) {
  const {batch,accounts,records,links,assets} = snapshot;
  return [insert('timebank_import_batches',batch,'ON CONFLICT(community_id,source_key) DO UPDATE SET source_sha256=excluded.source_sha256, expected_accounts=excluded.expected_accounts, expected_records=excluded.expected_records, expected_links=excluded.expected_links, expected_assets=excluded.expected_assets'),
    ...accounts.map((r)=>insert('timebank_import_accounts',r)),...records.map((r)=>insert('timebank_import_records',r)),...links.map((r)=>insert('timebank_import_record_accounts',r)),...assets.map(({file,...r})=>insert('timebank_import_assets',r))];
}
export async function verifySnapshot(snapshot,execute) {
  for (const [table,expected] of [['accounts',snapshot.accounts],['records',snapshot.records],['record_accounts',snapshot.links],['assets',snapshot.assets.map(({file,...row})=>row)]]) {
    const rows=await execute(`SELECT * FROM timebank_import_${table} WHERE batch_id=?`,[snapshot.batch.id]);
    const columns=Object.keys(expected[0] || {}).sort();
    const signature=(row)=>json(columns.map((key)=>row[key]));
    if(rows.length!==expected.length || json(rows.map(signature).sort())!==json(expected.map(signature).sort())) throw new Error(`Imported ${table} content differs from source`);
  }
}
export async function loadSnapshot(snapshot,execute,upload) {
  const existing = await execute('SELECT source_sha256,ready FROM timebank_import_batches WHERE id=?',[snapshot.batch.id]);
  if (existing[0] && existing[0].source_sha256 !== snapshot.batch.source_sha256) throw new Error('The source snapshot differs from the staged batch');
  if (!existing[0]?.ready) {
    // Immutable content-addressed uploads can be retried after interruption.
    if (upload) {
      const unique=[...new Map(snapshot.assets.map((a)=>[a.object_key,a])).values()];
      let next=0;
      await Promise.all(Array.from({length:4},async()=>{while(next<unique.length) await upload(unique[next++]);}));
    }
    for (const s of statements(snapshot)) await execute(s.sql,s.params);
    await verifySnapshot(snapshot,execute);
    await execute('UPDATE timebank_import_batches SET ready=1 WHERE id=?',[snapshot.batch.id]);
  }
  for (const [table,expected] of [['accounts',snapshot.batch.expected_accounts],['records',snapshot.batch.expected_records],['record_accounts',snapshot.batch.expected_links],['assets',snapshot.batch.expected_assets]]) {
    const rows = await execute(`SELECT COUNT(*) AS n FROM timebank_import_${table} WHERE batch_id=?`,[snapshot.batch.id]);
    if (Number(rows[0]?.n)!==expected) throw new Error(`Imported ${table} count mismatch`);
  }
  await verifySnapshot(snapshot,execute);
  return { ...snapshot.summary, batch_id:snapshot.batch.id, source_sha256:snapshot.batch.source_sha256, ready:true, repeated:Boolean(existing[0]?.ready) };
}
async function main() {
  process.umask(0o077);
  const args=process.argv.slice(2);const value=(name)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  if (!value('--archive') || !value('--plan')) throw new Error('Usage: node scripts/letsbmore-import.mjs --archive PRIVATE_DIR --plan PRIVATE_JSON [--local-db FILE | --remote] [--apply]');
  const plan=resolve(value('--plan'));const repo=resolve(dirname(new URL(import.meta.url).pathname),'../../..');
  if (plan.startsWith(repo+sep)) throw new Error('Write private plans outside the repository');
  const snapshot=buildSnapshot(value('--archive'));
  mkdirSync(dirname(plan),{recursive:true,mode:0o700});writeFileSync(plan,json(snapshot),{mode:0o600});
  if (!args.includes('--apply')) {console.log(json({...snapshot.summary,source_sha256:snapshot.batch.source_sha256,mode:'plan'}));return;}
  let execute,upload,db;
  if (value('--local-db') && !args.includes('--remote')) {
    db=new DatabaseSync(value('--local-db'));db.exec('PRAGMA foreign_keys=ON');
    execute=async(sql,params=[])=>{const s=db.prepare(sql);return s.columns().length?s.all(...params):(s.run(...params),[]);};
  } else if(args.includes('--remote') && !value('--local-db')) {
    const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
    const database=process.env.LETSBMORE_D1_ID;
    if (!account || !token || !database) throw new Error('Set Cloudflare credentials and explicit LETSBMORE_D1_ID');
    const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
    const call=async(path,body,headers={})=>{
      for(let attempt=0;attempt<4;attempt++) {
        const r=await fetch(base+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,...headers},body,signal:AbortSignal.timeout(60000)});
        if ((r.status===429 || r.status>=500) && attempt<3) {await new Promise((r)=>setTimeout(r,1000*(attempt+1)));continue;}
        const d=await r.json();if(!r.ok || !d.success)throw new Error(`Cloudflare request failed (${r.status}): ${json(d.errors)}`);return d.result;
      }
    };
    execute=async(sql,params=[])=>{const data=await call(`/d1/database/${database}/query`,json({sql,params}),{'Content-Type':'application/json'});return data[0].results;};
    upload=async(asset)=>{
      const response=await fetch(`${base}/r2/buckets/org-scan-images/objects/${encodeURIComponent(asset.object_key)}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':asset.content_type},body:readFileSync(asset.file),signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error(`Asset upload failed (${response.status})`);
      const verification=await fetch(`${base}/r2/buckets/org-scan-images/objects/${encodeURIComponent(asset.object_key)}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
      if(!verification.ok || createHash('sha256').update(new Uint8Array(await verification.arrayBuffer())).digest('hex')!==asset.sha256)throw new Error('Remote asset checksum mismatch');
    };
  } else throw new Error('Choose exactly one local or remote database');
  try {console.log(json(await loadSnapshot(snapshot,execute,upload)));} finally {db?.close();}
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch((e)=>{console.error(e.message);process.exitCode=1;});
