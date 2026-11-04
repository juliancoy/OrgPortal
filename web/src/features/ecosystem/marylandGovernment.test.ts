import {it,expect} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
it('preserves a single state organization and links all reviewed departments and budget agencies without payment inflation',async()=>{
 const file=fileURLToPath(new URL('../../../scripts/maryland-state-government.test.mjs',import.meta.url))
 const result=await promisify(execFile)(process.execPath,['--test',file],{timeout:30000})
 expect(result.stdout).toMatch(/pass 2/);expect(result.stdout).toMatch(/fail 0/)
})
