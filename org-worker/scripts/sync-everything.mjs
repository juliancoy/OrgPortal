import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { accountCommand } from './mcp-account-client.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Production API snapshots only; never touches DR or fixture databases. */
export async function syncEverything(command, account, log = console.log) {
  const identity = await accountCommand(command, account, 'status');
  if (!identity.authenticated || !identity.revocationChecked || identity.resource !== command.resource || identity.issuer !== command.issuer || !identity.account?.subject) throw Error('Live account, revocation and resource verification required.');
  const directory = command.workingDirectory;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) throw Error('Working-copy directory must be private.');
  const release = await lockfile.lock(join(directory, 'store'), { realpath: false, stale: 120000, update: 10000 });
  const binding = { resource: command.resource, issuer: command.issuer, subject: identity.account.subject, organizationId: command.organizationId, kind: 'everything' };
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const generation = randomUUID(), files = [], created = [];
  const save = async (name, value) => {
    const serialized = JSON.stringify({ ...value, binding, expiresAt }) + '\n';
    if (Buffer.byteLength(serialized) > 1024 * 1024) throw Error('Working-copy file exceeds 1 MiB; previous snapshot retained.');
    const temporary = join(directory, '.' + randomUUID() + '.tmp');
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(serialized); await file.sync(); } finally { await file.close(); }
    try { await rename(temporary, join(directory, name)); } finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  };
  try {
    const endpoint = command.resource.replace(/\/mcp$/, '/api/sync/everything');
    const seen = new Set();
    let cursor, records = 0, failures = 0, coverage;
    do {
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Bearer ${await account.accessToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ organizationId: command.organizationId, mode: command.catalog ? 'catalog' : 'pull', limit: 3, ...(cursor ? { cursor } : {}) }) });
      if (!response.ok) throw Error(`Sync endpoint returned HTTP ${response.status}. Check endpoint deployment and account permissions; previous snapshot retained.`);
      if (!response.body) throw Error('Empty sync response.');
      const reader = response.body.getReader(), chunks = [];
      let size = 0;
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw Error('Sync response exceeds 2 MiB.'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const page = JSON.parse(new TextDecoder().decode(bytes));
      if (page.version !== 1 || page.organizationId !== command.organizationId) throw Error('Invalid sync dataset.');
      if (command.catalog) { log(JSON.stringify(page, null, 2)); return; }
      if (page.resource !== command.resource || !Array.isArray(page.records) || typeof page.cycleComplete !== 'boolean' || (page.nextCursor !== null && typeof page.nextCursor !== 'string') || page.cycleComplete !== (page.nextCursor === null)) throw Error('Invalid sync page.');
      const name = hash({ binding, generation, page: files.length }) + '.json';
      await save(name, { kind: 'everything-page', generation, page });
      files.push(name); created.push(name);
      records += page.records.length; failures += page.records.filter(record => record.result?.isError).length;
      coverage = page.coverage; cursor = page.nextCursor;
      log(JSON.stringify({ sync: 'everything', pages: files.length, records, failures, pending: !!cursor }));
      if (cursor && (seen.has(cursor) || files.length >= 10000)) throw Error('Repeated cursor or excessive sync pages.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    if (failures) throw Error('Some domain reads were refused or failed; previous snapshot retained. Review live permissions and domain coverage.');
    const manifest = hash(binding) + '.json';
    await save(manifest, { kind: 'everything-manifest', generation, files, records, coverage, completedAt: new Date().toISOString() });
    created.length = 0;
    log(JSON.stringify({ synced: true, direction: 'production-to-local', records, pages: files.length, coverage, manifest: join(directory, manifest), expiresAt }));
  } finally {
    try { for (const name of created) await unlink(join(directory, name)).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
    finally { await release(); }
  }
}
