import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))

function runStep(label, script, args = []) {
  const started = performance.now()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      console.log(`[build] ${label}: ${((performance.now() - started) / 1000).toFixed(2)}s`)
      if (code === 0) resolve()
      else reject(new Error(`${label} failed (${signal || code})`))
    })
  })
}

export async function build(run = runStep) {
  await run('Ecosystem query index', 'scripts/build-ecosystem-query.mjs')
  await run('Network positions', 'scripts/build-network-positions.mjs')
  // TypeScript uses noEmit: it and Vite can read the same sources independently.
  // Wait for both, and require both to pass before reporting a successful build.
  const results = await Promise.allSettled([
    run('TypeScript', 'node_modules/typescript/bin/tsc', ['-b']),
    run('Vite', 'node_modules/vite/bin/vite.js', ['build']),
  ])
  const failures = results.filter(result => result.status === 'rejected')
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Frontend build failed')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
