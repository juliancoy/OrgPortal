import { execFileSync, spawnSync } from 'node:child_process';

export function assertLocalRelease(env = process.env) {
  if (env.WORKERS_CI === '1') throw new Error('Deploy locally tested artifacts explicitly; Cloudflare push deployment is disabled');
}

export function assertPublishedRelease(root, commit) {
  execFileSync('git', ['fetch', '--no-tags', 'origin', 'main'], { cwd: root, stdio: 'pipe' });
  const result = spawnSync('git', ['merge-base', '--is-ancestor', commit, 'FETCH_HEAD'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Release commit must be published in origin/main history');
}
