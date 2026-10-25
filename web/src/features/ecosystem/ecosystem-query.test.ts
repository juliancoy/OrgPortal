import {it,expect} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
it('validates the published ecosystem query index and server responses against source evidence',async()=>{
 const file=fileURLToPath(new URL('../../../../cloudflare/ecosystem-query.test.mjs',import.meta.url))
 const result=await promisify(execFile)(process.execPath,['--test',file],{timeout:120000,maxBuffer:1024*1024})
 expect(result.stdout).toMatch(/pass 6/)
 expect(result.stdout).toMatch(/fail 0/)
},120000)
