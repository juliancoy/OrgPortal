import {it,expect} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
it('keeps budget authority distinct from payments and rejects ambiguous source rows',async()=>{
 const file=fileURLToPath(new URL('../../../scripts/maryland-budget.test.mjs',import.meta.url))
 const result=await promisify(execFile)(process.execPath,['--test',file],{timeout:30000})
 expect(result.stdout).toMatch(/pass 3/);expect(result.stdout).toMatch(/fail 0/)
})
