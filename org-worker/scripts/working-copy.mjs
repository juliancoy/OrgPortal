import { mkdir, lstat, readFile, open, rename, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const days = 7 * 86400000;
const fields = ['name', 'description', 'image_url', 'links', 'city', 'tags'];
const profile = value => Object.fromEntries(fields.map(k => [k, value[k] ?? null]));

// This store is separate from Wrangler, DR archives and fixture databases.
// Private records can be retained by explicitly enrolled workflows, for seven days.
// Credentials stay in the keyring. Receiving tools own authorization and validation.
export async function workingCopy(command, account) {
  const directory = command.workingDirectory;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) throw Error('Working-copy directory must be private and owned by your account.');
  const release = await lockfile.lock(join(directory, 'store'), { realpath: false, stale: 120000, update: 10000 });
  const client = new Client({ name: 'OrgPortal working copy', version: '1.0.0' });
  let connected = false;
  const call = async (name, args) => {
    if (!connected) {
      await client.connect(new StreamableHTTPClientTransport(new URL(command.resource), { fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${await account.accessToken()}`);
        return fetch(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
      } }));
      connected = true;
    }
    const result = await client.callTool({ name, arguments: args });
    if (result.isError || !result.structuredContent) throw Error('Remote operation refused or unavailable; local draft retained.');
    return result.structuredContent;
  };
  const read = async path => {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 1024 * 1024) throw Error('Invalid working-copy file.');
    return JSON.parse(await readFile(path, 'utf8'));
  };
  const save = async (path, data) => {
    const serialized = JSON.stringify(data, null, 2) + '\n';
    if (Buffer.byteLength(serialized) > 1024 * 1024) throw Error('Working copy exceeds 1 MiB; enroll smaller record-specific workflows. Previous copy retained.');
    const temporary = join(directory, '.' + randomUUID() + '.tmp');
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(serialized); await file.sync(); }
    finally { await file.close(); }
    try { await rename(temporary, path); } finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  };
  try {
    // Bounded local retention also runs without a valid remote grant.
    let removed = 0;
    for (const name of await readdir(directory)) if (/^[a-f0-9]{64}\.json$/.test(name)) {
      const path = join(directory, name), entry = await read(path);
      if (!Number.isFinite(Date.parse(entry.expiresAt))) throw Error('Working copy has no valid expiry; remove it before continuing.');
      const forget = command.workingAction === 'forget' && entry.binding?.resource === command.resource && entry.binding?.issuer === command.issuer && entry.binding?.organizationId === command.organizationId;
      if (forget || Date.parse(entry.expiresAt) <= Date.now()) { await unlink(path); removed++; }
    }
    if (['purge','forget'].includes(command.workingAction)) return { removed };
    const identity = await call('get_connection_status', {});
    const subject = identity.account?.subject;
    if (!identity.authenticated || !identity.revocationChecked || !subject || identity.resource !== command.resource || identity.issuer !== command.issuer || !identity.scopes?.includes('org:portal.read')) throw Error('Live account, revocation and exact resource verification required.');
    const workflow = command.workflowFile ? JSON.parse(await readFile(command.workflowFile, 'utf8')) : null;
    let applyNeedsConfirm = true;
    if (workflow) {
      if (typeof workflow.readTool !== 'string' || !/^(get|list)_[a-z0-9_]+$/.test(workflow.readTool) ||
          typeof workflow.previewTool !== 'string' || !/^preview_[a-z0-9_]+$/.test(workflow.previewTool) ||
          workflow.applyTool !== workflow.previewTool.replace(/^preview_/, 'apply_') ||
          !workflow.readArguments || typeof workflow.readArguments !== 'object' || Array.isArray(workflow.readArguments) ||
          !workflow.writeArguments || typeof workflow.writeArguments !== 'object' || Array.isArray(workflow.writeArguments) ||
          Object.keys(workflow).some(k => !['readTool','readArguments','previewTool','applyTool','writeArguments','statusTool'].includes(k))) throw Error('Invalid enrolled workflow.');
      const tools = [];
      let cursor;
      do { const page = await client.listTools(cursor ? { cursor } : {}); tools.push(...page.tools); cursor = page.nextCursor; } while (cursor);
      const apply = tools.find(t => t.name === workflow.applyTool);
      // Preview tools may write a receipt, so their readOnlyHint can be false.
      if (!tools.find(t => t.name === workflow.readTool)?.annotations?.readOnlyHint || !tools.some(t => t.name === workflow.previewTool) || !apply || (workflow.statusTool && !tools.find(t => t.name === workflow.statusTool)?.annotations?.readOnlyHint)) throw Error('Workflow tools are unavailable or reads are not declared read-only.');
      applyNeedsConfirm = Object.hasOwn(apply.inputSchema.properties || {}, 'confirm');
    }
    const readTool = workflow?.readTool || 'get_organization_profile';
    const previewTool = workflow?.previewTool || 'preview_organization_profile';
    const applyTool = workflow?.applyTool || 'apply_organization_profile';
    const readArguments = { ...workflow?.readArguments, organizationId: command.organizationId };
    const fetchCurrent = async () => {
      const reply = await call(readTool, readArguments);
      if (workflow) {
        if (!reply.nextCursor) return reply;
        const pages = [reply], seen = new Set();
        let cursor = reply.nextCursor;
        while (cursor) {
          if (typeof cursor !== 'string' || seen.has(cursor) || pages.length >= 1000) throw Error('Invalid or excessive pagination; previous copy retained.');
          seen.add(cursor);
          const page = await call(readTool, { ...readArguments, cursor });
          pages.push(page); cursor = page.nextCursor;
          if (Buffer.byteLength(JSON.stringify(pages)) > 900000) throw Error('Collection exceeds working-copy limit; enroll record-specific workflows.');
        }
        return { pages };
      }
      if (reply.organization?.id !== command.organizationId) throw Error('Production returned another organization. Use its exact ID.');
      return profile(reply.organization);
    };
    const binding = { resource: command.resource, issuer: command.issuer, subject, organizationId: command.organizationId, workflow };
    const path = join(directory, hash(binding) + '.json');
    let state;
    try { state = await read(path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (state && canonical(state.binding) !== canonical(binding)) throw Error('Working-copy identity mismatch.');
    if (command.workingAction === 'status') return { exists: !!state, organizationId: command.organizationId, pending: !!state && Object.keys(state.patch).length > 0, receipt: state?.preview?.previewId ?? null, uncertain: !!state?.attempt, expiresAt: state?.expiresAt };
    if (command.workingAction === 'edit') {
      if (!state) throw Error('Pull the organization before editing.');
      if (state.attempt) throw Error('Inspect the uncertain operation before editing.');
      const patch = JSON.parse(await readFile(command.profileFile, 'utf8'));
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some(k => ['organizationId','confirm','previewId'].includes(k) || (!workflow && !fields.includes(k)) || Object.hasOwn(workflow?.writeArguments || {}, k))) throw Error('Supply editable fields only; enrolled target arguments cannot change.');
      state.patch = { ...state.patch, ...patch }; delete state.preview;
      await save(path, state);
      return { pending: true, fields: Object.keys(state.patch), expiresAt: state.expiresAt };
    }
    if (state?.attempt) {
      const statusTool = workflow ? workflow.statusTool : 'get_organization_profile_operation';
      const operation = statusTool ? await call(statusTool, { organizationId: command.organizationId, previewId: state.attempt.previewId }) : { previewId: state.attempt.previewId, status: 'unknown' };
      return { pending: true, outcomeUncertain: true, operation, action: 'Inspect the operation and current production record before forgetting or retrying this copy.' };
    }
    const current = await fetchCurrent();
    if (!state) state = { version: 1, binding, baseline: current, patch: {}, expiresAt: new Date(Date.now() + days).toISOString() };
    const pending = Object.keys(state.patch).length > 0;
    if (pending && hash(current) !== hash(state.baseline)) return { conflict: true, pending: true, action: 'Production changed. Review production and the local draft before creating a new working copy.' };
    if (!pending || command.workingAction === 'pull') {
      state.baseline = current;
      await save(path, state);
      return workflow ? { record: current, draft: state.patch, pending, expiresAt: state.expiresAt } : { organization: { ...current, ...state.patch }, pending, expiresAt: state.expiresAt };
    }
    const args = { ...state.patch, ...workflow?.writeArguments, organizationId: command.organizationId };
    if (command.workingAction === 'preview') {
      const preview = await call(previewTool, args);
      if (!preview.previewId || hash(workflow ? await fetchCurrent() : profile(preview.before)) !== hash(state.baseline)) throw Error('Production changed during preview; local draft retained.');
      state.preview = { previewId: preview.previewId, patchHash: hash(state.patch) };
      await save(path, state);
      return preview;
    }
    if (command.workingAction !== 'sync') throw Error('Unknown working-copy action.');
    if (!state.preview || command.previewId !== state.preview.previewId || hash(state.patch) !== state.preview.patchHash) throw Error('Review working-copy preview, then sync with its exact --preview-id.');
    // Persist before dispatch: an interrupted write is never replayed blindly.
    state.attempt = { previewId: state.preview.previewId };
    await save(path, state);
    const applied = await call(applyTool, { ...args, ...(applyNeedsConfirm ? { confirm: true } : {}), previewId: state.preview.previewId });
    if (applied.success === false || applied.outcomeUncertain || (!workflow && applied.organization?.id !== command.organizationId)) throw Error('Uncertain production response; inspect the recorded operation.');
    state.baseline = workflow ? await fetchCurrent() : profile(applied.organization); state.patch = {};
    delete state.attempt; delete state.preview;
    await save(path, state);
    return { synced: true, ...(workflow ? { record: state.baseline } : { organization: state.baseline }), expiresAt: state.expiresAt };
  } finally {
    try { if (connected) await client.close(); } finally { await release(); }
  }
}
