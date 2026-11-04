import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {expect,it} from 'vitest'

it('keeps parent and child scopes distinct before pagination',()=>{
 const output=execFileSync(process.execPath,['--test','cloudflare/graph-direction.test.mjs'],{
  cwd:fileURLToPath(new URL('../../../..',import.meta.url)),encoding:'utf8',timeout:30000,
 })
 expect(output).toMatch(/(?:# fail|ℹ fail) 0/)
})
