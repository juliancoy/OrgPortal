import { createHash } from 'node:crypto';
import { mkdir, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';

export function connectionKey(resource, issuer) {
  return createHash('sha256').update(JSON.stringify([issuer, resource])).digest('hex');
}

export async function credentialStore(resource, issuer) {
  const { AsyncEntry } = await import('@napi-rs/keyring');
  const key = connectionKey(resource, issuer);
  const directory = join(homedir(), '.orgportal-connections');
  await mkdir(directory, { mode: 0o700, recursive: true });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32'
      && (info.uid !== process.getuid() || (info.mode & 0o077)))) throw new Error('Connection lock directory must be private to your account');
  const release = await lockfile.lock(join(directory, key), { realpath: false, retries: 0, stale: 120000 });
  try {
    const entry = new AsyncEntry('OrgPortal upload OAuth', key, { linux: { store: 'secret-service' } });
    return {
      async load() {
        try {
          const value = await entry.getPassword();
          const record = value ? JSON.parse(value) : null;
          if (record && (typeof record.clientId !== 'string' || !record.clientId
              || (record.refreshToken !== undefined && typeof record.refreshToken !== 'string')
              || (record.pending !== undefined && typeof record.pending !== 'boolean'))) throw new Error();
          return record;
        } catch { throw new Error('Cannot read the saved connection. Check your OS keyring; no plaintext fallback is used.'); }
      },
      async save(value) {
        try { await entry.setPassword(JSON.stringify(value)); }
        catch { throw new Error('Cannot save the connection in the OS keyring.'); }
      },
      release,
    };
  } catch {
    await release();
    throw new Error('OS credential storage is unavailable. Unlock or enable your system keyring; no plaintext fallback is used.');
  }
}

export async function tokenConnection({ resource, clientId, metadata, token, store, saved, requestJson }) {
  let expiresAt = 0;
  let refreshToken = saved?.refreshToken;
  let pending = saved?.pending || false;
  const save = async () => store?.save({ clientId, refreshToken, pending });
  const accept = async value => {
    if (!value || typeof value.access_token !== 'string' || !value.access_token
        || typeof value.refresh_token !== 'string' || !value.refresh_token
        || !Number.isFinite(value.expires_in) || value.expires_in <= 0) throw new Error('Incomplete token response; reconnect through PIdP');
    token = value;
    refreshToken = value.refresh_token;
    expiresAt = Date.now() + value.expires_in * 1000;
    pending = false;
    try { await save(); } catch (error) { pending = true; throw error; }
  };
  if (token) {
    try { await accept(token); }
    catch (error) {
      if (typeof token?.refresh_token === 'string' && token.refresh_token) {
        try {
          const response = await fetch(metadata.revocation_endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
            body: new URLSearchParams({ client_id: clientId, token: token.refresh_token }) });
          if (!response.ok) throw new Error();
          await store?.save({ clientId });
        } catch { throw new Error('Connection could not be saved or cleaned up. Revoke it in PIdP before reconnecting.'); }
      }
      throw error;
    }
  }
  let refreshing;
  return {
    async accessToken() {
      if (refreshing) return refreshing;
      if (pending) throw new Error('Previous refresh outcome is uncertain. Disconnect and sign in again; the old refresh token will not be replayed.');
      if (Date.now() < expiresAt - 30000) return token.access_token;
      refreshing = (async () => {
        // Persist intent before a one-use refresh. A crash cannot replay the token.
        pending = true;
        await save();
        const value = await requestJson(metadata.token_endpoint, { method: 'POST', body: new URLSearchParams({
          grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, resource }) });
        await accept(value);
        return token.access_token;
      })();
      try { return await refreshing; } finally { refreshing = null; }
    },
    async disconnect() {
      if (refreshToken) {
        const response = await fetch(metadata.revocation_endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          body: new URLSearchParams({ client_id: clientId, token: refreshToken }) });
        if (!response.ok) throw new Error('Disconnect failed; saved credentials retained. Revoke the connection in PIdP.');
      }
      await store?.save({ clientId });
      token = null; refreshToken = null; expiresAt = 0; pending = true;
    },
    async close() { if (!store) await this.disconnect(); },
  };
}
