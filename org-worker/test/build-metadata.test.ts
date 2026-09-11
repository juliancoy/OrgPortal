import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('build metadata identifies its own checkout, marks edits, and never adopts a parent repository SHA', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orgportal-build-'));
  const runGit = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  function setup(root: string) {
    mkdirSync(join(root, 'org-worker/scripts'), { recursive: true });
    copyFileSync(new URL('../scripts/build-metadata.mjs', import.meta.url), join(root, 'org-worker/scripts/build-metadata.mjs'));
    writeFileSync(join(root, '.gitignore'), 'org-worker/src/generated/\n');
  }
  function generate(root: string, explicit = '') {
    execFileSync(process.execPath, [join(root, 'org-worker/scripts/build-metadata.mjs')], {
      cwd: dir, env: { ...process.env, ORGPORTAL_BUILD_COMMIT: explicit, GITHUB_SHA: 'f'.repeat(40) }, stdio: 'pipe',
    });
    const source = readFileSync(join(root, 'org-worker/src/generated/buildMetadata.ts'), 'utf8');
    return JSON.parse(source.match(/export const buildMetadata = (.*) as const;/)![1]);
  }
  try {
    setup(dir);
    runGit(dir, 'init');
    runGit(dir, 'add', '.');
    runGit(dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'fixture');
    const sha = runGit(dir, 'rev-parse', 'HEAD');
    assert.equal(generate(dir).commit, sha);
    assert.equal(generate(dir).dirty, false);
    writeFileSync(join(dir, 'org-worker/wrangler.jsonc'), '{"name":"generated-deploy-config"}\n');
    assert.equal(generate(dir).dirty, false);
    writeFileSync(join(dir, 'local-edit.txt'), 'local edit');
    assert.equal(generate(dir).dirty, true);
    const archive = join(dir, 'embedded-archive');
    setup(archive);
    assert.equal(generate(archive).commit, null);
    const explicit = 'a'.repeat(40);
    assert.equal(generate(archive, explicit).commit, explicit);
    assert.equal(generate(archive, explicit).dirty, null);
    assert.throws(() => generate(archive, 'invalid-sha'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
