import { mkdir, lstat, readFile, open, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';

const validName = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(value);
const validOrigin = value => { try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; } catch { return false; } };
function validEntry(entry) {
  if (!entry || !validName(entry.name) || !validOrigin(entry.issuer)) return false;
  try { const url = new URL(entry.resource); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.href === entry.resource && url.pathname.endsWith('/mcp') && Object.keys(entry).every(key => ['name','resource','issuer'].includes(key)); } catch { return false; }
}

// Only names and endpoints live here. Credentials remain in the existing OS keyring.
export function connectionSettings(directory = join(homedir(), '.orgportal-connections')) {
  const path = join(directory, 'connections.json');
  async function prepare() {
    await mkdir(directory, { mode: 0o700, recursive: true });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.uid !== process.getuid() || (info.mode & 0o077)))) throw Error('Connection settings directory must be private to your account.');
  }
  async function read() {
    await prepare();
    let info;
    try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return { version: 1, connections: [], selected: [] }; throw error; }
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024 || (process.platform !== 'win32' && (info.uid !== process.getuid() || (info.mode & 0o077)))) throw Error('Connection settings must be a private regular file.');
    let value;
    try { value=JSON.parse(await readFile(path,'utf8')); } catch { throw Error('Connection settings are invalid. Restore the local connection names file; credentials remain in the OS keyring.'); }
    if (!value || value.version !== 1 || !Array.isArray(value.connections) || !Array.isArray(value.selected) || ![...value.connections,...value.selected].every(validEntry) || Object.keys(value).some(key => !['version','connections','selected'].includes(key))) throw Error('Invalid connection settings.');
    return value;
  }
  const matches = (entry, resource, issuer) => entry.resource === resource && entry.issuer === issuer;
  async function update(change) {
    await prepare();
    const release = await lockfile.lock(join(directory, 'connection-settings'), { realpath: false, retries: { retries: 20, minTimeout: 50, maxTimeout: 250, randomize: true }, stale: 120000 });
    const temporary = join(directory, `.connections-${randomUUID()}.tmp`);
    try {
      const value = await read(); change(value);
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(value) + '\n'); await file.sync(); } finally { await file.close(); }
      await rename(temporary, path);
    } finally { try { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); } finally { await release(); } }
  }
  return {
    async active(resource, issuer) { return (await read()).selected.find(entry => matches(entry, resource, issuer))?.name || 'default'; },
    async list(resource, issuer) { return (await read()).connections.filter(entry => matches(entry, resource, issuer)).map(entry => entry.name).sort(); },
    async remember(resource, issuer, name) {
      if (!validEntry({ resource, issuer, name })) throw Error('Invalid connection target.');
      await update(value => { if (!value.connections.some(entry => matches(entry, resource, issuer) && entry.name === name)) value.connections.push({ resource, issuer, name }); });
    },
    async select(resource, issuer, name) {
      if (!validEntry({ resource, issuer, name })) throw Error('Invalid connection target.');
      await update(value => { if (!value.connections.some(entry => matches(entry, resource, issuer) && entry.name === name)) throw Error('Sign in to this named connection before selecting it.'); value.selected = value.selected.filter(entry => !matches(entry, resource, issuer)); value.selected.push({ resource, issuer, name }); });
    },
    async remove(resource, issuer, name) {
      await update(value => { const keep = entry => !(matches(entry, resource, issuer) && entry.name === name); value.connections = value.connections.filter(keep); value.selected = value.selected.filter(keep); });
    },
  };
}
