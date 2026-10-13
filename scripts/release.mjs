#!/usr/bin/env node
// One repository, one commit. Migrations and identity releases are deliberately separate.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(root);
const [action, target = 'all'] = process.argv.slice(2);
if (!['check', 'build', 'deploy', 'verify'].includes(action) || !['all', 'web', 'api'].includes(target)) {
  throw new Error('Usage: node scripts/release.mjs check|build|deploy|verify [all|web|api]');
}
const web = target !== 'api', api = target !== 'web';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const dirty = Boolean(git('status', '--porcelain', '--untracked-files=normal'));
const wrangler = resolve(root, 'org-worker/node_modules/.bin/wrangler');
function run(command, args, cwd = root, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
const npm = (dir, ...args) => run('npm', args, resolve(root, dir));
if (action === 'check') {
  if (web) {
    npm('web', 'test', '--', '--maxWorkers=2');
    run('bash', ['-c', 'node --test cloudflare/*.test.mjs web/tests/unit/*.test.mjs']);
  }
  if (api) { npm('org-worker', 'run', 'typecheck'); npm('org-worker', 'test'); }
}
if (action === 'build') {
  mkdirSync('.release', { recursive: true });
  const metadata = { commit, dirty, builtAt: new Date().toISOString() };
  if (web) {
    const buildNumber = Math.floor(Date.now() / 1000).toString();
    run('npm', ['run', 'build'], resolve(root, 'web'), {
      VITE_PUBLIC_BASE: '/', VITE_PIDP_BASE_URL: '/pidp', VITE_CHAT_API_BASE_URL: '/api/chat',
      VITE_UPDATE_MANIFEST_URL: '/mobile-update.json', VITE_APP_BUILD_NUMBER: buildNumber,
    });
    rmSync('.release/site', { recursive: true, force: true });
    mkdirSync('.release/site', { recursive: true });
    cpSync('web/dist', '.release/site/__portal_root', { recursive: true });
    const version = JSON.parse(readFileSync('web/package.json', 'utf8')).version;
    run('node', ['web/scripts/write-web-update-manifest.mjs', 'web/public/mobile-update.json', '.release/site/__portal_root/mobile-update.json', buildNumber, version]);
    writeFileSync('.release/site/__deployment.json', JSON.stringify(metadata));
    run(wrangler, ['deploy', '--config', 'cloudflare/wrangler.jsonc', '--dry-run', '--outdir', resolve(root, '.release/web')]);
    writeFileSync('.release/web.json', JSON.stringify(metadata));
  }
  if (api) {
    npm('org-worker', 'run', 'build:metadata');
    run(wrangler, ['deploy', '--config', 'org-worker/wrangler.jsonc', '--dry-run', '--outdir', resolve(root, '.release/api')]);
    writeFileSync('.release/api.json', JSON.stringify(metadata));
  }
}
async function cf(path, method = 'GET', body) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error('Cloudflare account ID and deployment token are required');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    method, headers: { authorization: `Bearer ${token}` }, body, signal: AbortSignal.timeout(120000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare ${method} ${path}: ${JSON.stringify(data.errors)}`);
  return data.result;
}
if (action === 'deploy') {
  if (dirty) throw new Error('Refusing to deploy a dirty checkout');
  const main = git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0];
  if (main !== commit) throw new Error('Release commit is no longer main; build the current main commit');
  for (const part of [api && 'api', web && 'web'].filter(Boolean)) {
    const built = JSON.parse(readFileSync(`.release/${part}.json`, 'utf8'));
    if (built.commit !== commit || built.dirty) throw new Error(`Rebuild ${part} from this clean commit`);
  }
  if (api) {
    // Code-only release: inherit ALL live bindings, including secrets. Do not reset
    // runtime settings or run migrations, queues, cron or domain configuration.
    const path = '/workers/scripts/org-codecollective';
    const settings = await cf(`${path}/settings`);
    const metadata = { main_module: 'index.js', bindings: settings.bindings.map(({ name }) => ({ name, type: 'inherit' })), annotations: { 'workers/message': `OrgPortal ${commit}` } };
    for (const key of ['compatibility_date', 'compatibility_flags', 'usage_model', 'logpush', 'observability', 'tags', 'tail_consumers', 'limits']) {
      if (settings[key] !== undefined) metadata[key] = settings[key];
    }
    if (settings.placement?.mode) metadata.placement = { mode: settings.placement.mode };
    const form = new FormData();
    form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.set('index.js', new Blob([readFileSync('.release/api/index.js')], { type: 'application/javascript+module' }), 'index.js');
    const released = await cf(path, 'PUT', form);
    console.log(JSON.stringify({ service: 'org-codecollective', commit, version: released.deployment_id }));
  }
  if (web) run(wrangler, ['deploy', '--config', 'cloudflare/wrangler.jsonc', '--keep-vars', '--message', `OrgPortal ${commit}`]);
  await verify();
}
async function verify() {
  for (const [enabled, origin, expectedService] of [
    [api, 'https://orgportal.cc/api/org', 'org-worker'],
    [web, 'https://orgportal-web.jcloiacon.workers.dev', 'orgportal-web'],
  ]) {
    if (!enabled) continue;
    let result;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const response = await fetch(`${origin}/health?release=${commit}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        result = await response.json();
        if (response.ok && result.ok && result.service === expectedService && result.commit === commit && result.dirty === false) break;
      } catch { result = null; }
      if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (!result?.ok || result.service !== expectedService || result.commit !== commit || result.dirty !== false) throw new Error(`Release health verification failed: ${origin}`);
    console.log(JSON.stringify({ verified: origin, commit, version: result.workerVersionId }));
    if (expectedService === 'orgportal-web') {
      const response = await fetch(`${origin}/`, { headers: { accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
      const html = await response.text();
      const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/);
      if (!response.ok || !asset) throw new Error('Frontend page or entry asset is missing');
      const entry = await fetch(`${origin}${asset[1]}`, { signal: AbortSignal.timeout(30000) });
      if (!entry.ok || !(entry.headers.get('content-type') || '').includes('javascript')) throw new Error('Frontend entry asset failed');
      const upstream = await fetch(`${origin}/api/org/health`, { signal: AbortSignal.timeout(30000) });
      const apiHealth = await upstream.json();
      if (!upstream.ok || apiHealth.service !== 'org-worker' || (api && apiHealth.commit !== commit)) throw new Error('Frontend API proxy failed');
      console.log(JSON.stringify({ verified: origin, page: true, entryAsset: true, apiProxy: true }));
    }
  }
}
if (action === 'verify') await verify();
