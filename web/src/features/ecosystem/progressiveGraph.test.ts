import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {expect,it} from 'vitest'

it('preserves incremental layout state in every dimension',{timeout:125000},()=>{
 const output=execFileSync(process.execPath,['--test',
  'scripts/progressive-graph.test.mjs','scripts/ecosystem-physics.test.mjs',
  'scripts/graph-3d.test.mjs','scripts/particle-life-4d.test.mjs',
  'scripts/frame-budget.test.mjs','scripts/network-layouts.test.mjs',
 ],{cwd:fileURLToPath(new URL('../../..',import.meta.url)),encoding:'utf8',timeout:120000})
 expect(output).toMatch(/(?:# fail|ℹ fail) 0/)
})
