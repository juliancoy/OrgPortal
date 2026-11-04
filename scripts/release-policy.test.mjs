import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLocalRelease, assertPublishedRelease } from './release-policy.mjs';

test('a locally tested published release remains valid after main advances, while unpublished commits are rejected', () => {
  const folder = mkdtempSync(join(tmpdir(), 'release-policy-'));
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const author = cwd => { git(cwd, 'config', 'user.name', 'Local release fixture'); git(cwd, 'config', 'user.email', 'release@example.invalid'); };
  try {
    const origin = join(folder, 'origin.git'), publisher = join(folder, 'publisher'), candidate = join(folder, 'candidate');
    git(folder, 'init', '--bare', '--initial-branch=main', origin);
    git(folder, 'clone', origin, publisher); author(publisher);
    writeFileSync(join(publisher, 'version'), 'tested'); git(publisher, 'add', '.'); git(publisher, 'commit', '-m', 'Tested candidate'); git(publisher, 'push', 'origin', 'main');
    git(folder, 'clone', origin, candidate); author(candidate);
    const tested = git(candidate, 'rev-parse', 'HEAD');
    assert.doesNotThrow(() => assertPublishedRelease(candidate, tested));
    writeFileSync(join(publisher, 'version'), 'next unvalidated work'); git(publisher, 'commit', '-am', 'Main advances'); git(publisher, 'push', 'origin', 'main');
    assert.doesNotThrow(() => assertPublishedRelease(candidate, tested));
    assert.equal(git(candidate, 'rev-parse', 'HEAD'), tested);
    writeFileSync(join(candidate, 'version'), 'unpublished'); git(candidate, 'commit', '-am', 'Unpublished work');
    assert.throws(() => assertPublishedRelease(candidate, git(candidate, 'rev-parse', 'HEAD')), /published/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('Cloudflare automatic builds cannot deploy, while local CI containers can release', () => {
  assert.throws(() => assertLocalRelease({ WORKERS_CI: '1' }), /push deployment is disabled/);
  assert.doesNotThrow(() => assertLocalRelease({ CI: 'true' }));
});

test('GitHub workflows require explicit dispatch', () => {
  const folder = new URL('../.github/workflows/', import.meta.url);
  for (const name of readdirSync(folder).filter(name => /\.ya?ml$/.test(name))) {
    const source = readFileSync(new URL(name, folder), 'utf8');
    assert.match(source, /\non:\n  workflow_dispatch:\n/);
    assert.doesNotMatch(source, /^  (push|pull_request|schedule|workflow_run):/m, name);
  }
});
