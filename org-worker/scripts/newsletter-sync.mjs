import { request as httpsRequest } from 'node:https';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');

export async function collectFeed(call, path, key) {
  let after = 0;
  const changes = [];
  while (true) {
    const reply = await call(path + '?after=' + after);
    if (key && reply.datasetId !== key) throw Error('Local dataset mismatch');
    if (!Array.isArray(reply.changes) || !Number.isSafeInteger(reply.cursor) || reply.cursor < after ||
        typeof reply.hasMore !== 'boolean' || (reply.hasMore && reply.cursor <= after)) throw Error('Invalid newsletter feed');
    for (const change of reply.changes) {
      if (change.entity !== 'newsletter' || typeof change.id !== 'string') throw Error('Unexpected newsletter change');
      changes.push(change);
    }
    if (!reply.hasMore) return changes;
    after = reply.cursor;
  }
}

export function compareHistory(local, remote) {
  const left = new Map(local.map(change => [change.id, change]));
  const right = new Map(remote.map(change => [change.id, change]));
  for (const [id, change] of left) if (right.has(id) && fingerprint(change) !== fingerprint(right.get(id))) throw Error('Conflicting immutable newsletter history: ' + id);
  return { push: local.filter(change => !right.has(change.id)), pull: remote.filter(change => !left.has(change.id)) };
}

async function remoteJson(url, token, body, retry = 0) {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'OrgPortal-CLI/0.1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (response.status === 429 && retry < 3) {
    await response.body?.cancel();
    const waitMs = 60000 - Date.now() % 60000 + 100;
    console.log('Account request limit reached; resuming in the next minute.');
    await new Promise(done => setTimeout(done, Math.min(waitMs, 60000)));
    return remoteJson(url, token, body, retry + 1);
  }
  if (!response.ok) throw Error(`Remote newsletter API returned ${response.status}; check login, scopes and deployment.`);
  return response.json();
}

async function localJson(url, token, ca, body) {
  return new Promise((resolveReply, reject) => {
    const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const request = httpsRequest(url, { ca, method: bytes ? 'POST' : 'GET', timeout: 30000,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {}) } }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 10 * 1024 * 1024) { response.destroy(Error('Local response exceeds limit')); } else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(Error(`Local newsletter API returned ${response.statusCode}`));
        try { resolveReply(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(Error('Invalid local response')); }
      });
    });
    request.on('error', reject); request.on('timeout', () => request.destroy(Error('Local request timed out')));
    request.end(bytes);
  });
}

export async function syncNewsletterDatabase(command, account, root, log = console.log) {
  const local = new URL(command.local);
  if (local.protocol !== 'https:' || !['localhost', '127.0.0.1', '[::1]'].includes(local.hostname) || local.username || local.password || local.pathname !== '/' || local.search || local.hash) throw Error('Local sync requires a loopback HTTPS origin');
  const config = JSON.parse(await readFile(command.deployment, 'utf8'));
  const ca = await readFile(command.cert);
  const callLocal = (path, body) => localJson(new URL('/api/org/api/local/newsletters' + path, local), config.token, ca, body);
  const remoteBase = command.resource.replace(/\/mcp$/, '/api/newsletters');
  const callRemote = async (path, body) => remoteJson(remoteBase + path, await account.accessToken(), body);
  return syncNewsletterHistory({ command, config, callLocal, callRemote, root, log });
}

export async function syncNewsletterHistory({ command, config, callLocal, callRemote, root, log = console.log }) {
  const status = await callRemote('/status');
  if (status.privacy !== 'account-only' || status.resource !== command.resource || status.versions?.protocol !== 1) throw Error('Incompatible private remote archive');
  const localChanges = await collectFeed(callLocal, '/export', config.datasetId);
  const remoteChanges = await collectFeed(callRemote, '/changes');
  const plan = compareHistory(localChanges, remoteChanges);
  log(JSON.stringify({ privacy: status.privacy, ownerId: status.ownerId, resource: command.resource, localChanges: localChanges.length, remoteChanges: remoteChanges.length, push: plan.push.length, pull: plan.pull.length, dryRun: command.dryRun }));
  if (command.dryRun) return;
  const receipts = [];
  // One issue per transaction keeps full MIME originals within the request limit.
  // Replaying accepted change IDs is inert after a lost response or process crash.
  for (const change of plan.push) {
    const hash = change.value?.source?.sourceArchiveSha256;
    const archives = hash ? [await callLocal('/archives/' + hash)] : [];
    if (archives.length && fingerprint(archives[0]) !== hash) throw Error('Corrupt local source archive');
    const payload = { changes: [change], archives };
    if (Buffer.byteLength(JSON.stringify(payload)) > 1000000) throw Error('Newsletter exceeds the bounded remote batch size');
    const preview = await callRemote('/preview', payload);
    if (preview.fingerprint !== fingerprint(payload) || preview.ownerId !== status.ownerId || preview.resource !== command.resource || preview.privacy !== 'account-only') throw Error('Remote preview mismatch');
    const applied = await callRemote('/apply', { ...payload, previewId: preview.previewId });
    if (applied.fingerprint !== preview.fingerprint || applied.ownerId !== status.ownerId || applied.resource !== command.resource || !applied.acknowledged?.includes(change.id)) throw Error('Remote acknowledgement mismatch');
    receipts.push({ changeId: change.id, previewId: preview.previewId, fingerprint: preview.fingerprint });
    if (receipts.length % 10 === 0) log(`Verified ${receipts.length}/${plan.push.length} uploaded changes.`);
  }
  const received = await collectFeed(callRemote, '/changes');
  for (let start = 0; start < received.length; start += 20) {
    const chunk = received.slice(start, start + 20);
    const reply = await callLocal('/sync', { datasetId: config.datasetId, changes: chunk, after: 0 });
    if (reply.datasetId !== config.datasetId || !chunk.every(change => reply.acknowledged?.includes(change.id))) throw Error('Local acknowledgement mismatch');
  }
  const hashes = new Set();
  for (const change of received) {
    const hash = change.value?.source?.sourceArchiveSha256;
    if (!hash || hashes.has(hash)) continue;
    const archive = await callRemote('/archives/' + hash);
    if (fingerprint(archive) !== hash) throw Error('Corrupt remote source archive');
    await callLocal('/archives', { recordId: change.recordId, archive }); hashes.add(hash);
  }
  const verified = compareHistory(await collectFeed(callLocal, '/export', config.datasetId), received);
  if (verified.push.length || verified.pull.length) throw Error('History changed during sync; run again to converge');
  const directory = resolve(root, '.local/newsletter-sync-receipts');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  await writeFile(file, JSON.stringify({ datasetId: config.datasetId, ownerId: status.ownerId, resource: command.resource, verifiedChanges: received.length, verifiedOriginals: hashes.size, receipts }, null, 2) + '\n', { mode: 0o600 });
  log(`Newsletter history and ${hashes.size} originals verified on local SQLite and private remote D1. Receipt: ${file}`);
}
