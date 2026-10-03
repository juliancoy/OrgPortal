import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export function changesFor(record, live) {
  if (!live || live.id !== record.id) throw new Error(`Missing venue ${record.id}`);
  const changes = {};
  for (const [key, value] of Object.entries(record.patch)) {
    if ((live[key] ?? null) === value) continue;
    if ((live[key] ?? null) !== (record.before[key] ?? null)) {
      throw new Error(`Venue ${record.id}: ${key} changed since research; review again.`);
    }
    changes[key] = value;
  }
  return changes;
}

async function main() {
  const { values } = parseArgs({ options: { file: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  if (!values.file) throw new Error('Use --file data/medtech-venues-2026-10-03.json [--apply]');
  const data = JSON.parse(await readFile(values.file, 'utf8'));
  const base = new URL(data.resource);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
      || !['/api/network/venues', '/api/org/api/network/venues'].includes(base.pathname)) {
    throw new Error('Expected an HTTPS OrgPortal venue API.');
  }
  const token = process.env.ORGPORTAL_SESSION_TOKEN;
  if (values.apply && !token) throw new Error('Applying requires the existing member account session via ORGPORTAL_SESSION_TOKEN. Do not use an owner account or send credentials in chat.');
  const request = async (path, options = {}) => {
    const response = await fetch(`${base.href}${path}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', ...(token && values.apply ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) throw new Error(`Venue request failed (${response.status}) for ${path}.`);
    return response.json();
  };
  const live = await request('/public');
  const plan = data.updates.map(record => ({ record, changes: changesFor(record, live.find(v => v.id === record.id)) }))
    .filter(item => Object.keys(item.changes).length);
  console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'preview', venues: plan.length,
    changes: plan.map(({ record, changes }) => ({ id: record.id, name: record.original_name, changes })),
    unresolved: data.unresolved }, null, 2));
  if (!values.apply) return;
  // Check all live permissions and current values before the first write.
  for (const { record } of plan) {
    const managed = await request(`/${encodeURIComponent(record.id)}/manage`);
    for (const key of Object.keys(record.patch)) {
      if (!(key in managed)) throw new Error(`The deployed venue schema is missing ${key}; release the venue-details migration/API before applying.`);
    }
    changesFor(record, managed);
  }
  let saved = 0;
  try {
    for (const { record, changes } of plan) {
      changesFor(record, await request(`/${encodeURIComponent(record.id)}/manage`));
      await request(`/${encodeURIComponent(record.id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
      const actual = await request(`/public/${encodeURIComponent(record.id)}`);
      for (const [key, value] of Object.entries(changes)) {
        if (actual[key] !== value) throw new Error(`Venue ${record.id}: ${key} was not saved; check the deployed schema/API.`);
      }
      saved++;
    }
  } catch (error) {
    throw new Error(`${saved} venue updates verified before stopping. ${error.message} Rerun the preview; already saved fields are skipped.`);
  }
  console.log(`${saved} venue updates saved and verified through OrgPortal.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
