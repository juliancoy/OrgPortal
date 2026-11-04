import {it,expect} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'

it('ranks and expands graph scopes while preserving transaction records',async()=>{
 const scripts=['graph-relevance.test.mjs','transaction-graph.test.mjs'].map(name=>fileURLToPath(new URL(`../../../scripts/${name}`,import.meta.url)))
 const {stdout}=await promisify(execFile)(process.execPath,['--test',...scripts],{timeout:30000})
 expect(stdout).toMatch(/pass [1-9]\d*/)
 expect(stdout).toMatch(/fail 0/)
})
