// @ts-expect-error Node-only release helper has no TypeScript declaration.
import {waitForRoutingProof} from '../../../../scripts/routing-proof.mjs'
import {it,expect} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
it('validates the published ecosystem query index and server responses against source evidence',async()=>{
 const file=fileURLToPath(new URL('../../../../cloudflare/ecosystem-query.test.mjs',import.meta.url))
 if(process.env.ORGPORTAL_ROUTING_PROOF&&process.env.ORGPORTAL_ROUTING_RUN_ID){
  await waitForRoutingProof({path:process.env.ORGPORTAL_ROUTING_PROOF,runId:process.env.ORGPORTAL_ROUTING_RUN_ID,sourceFile:file})
  return
 }
 const result=await promisify(execFile)(process.execPath,['--test',file],{timeout:120000,maxBuffer:1024*1024})
 expect(result.stdout).toMatch(/pass 6/)
 expect(result.stdout).toMatch(/fail 0/)
},120000)
