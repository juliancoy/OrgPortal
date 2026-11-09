import {createHash,randomUUID} from 'node:crypto'
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises'
import {dirname} from 'node:path'

export const sourceHash=async path=>createHash('sha256').update(await readFile(path)).digest('hex')
export async function writeRoutingProof(path,{runId,sourceFile,passed}){
 await mkdir(dirname(path),{recursive:true})
 const value={runId,node:process.version,sourceHash:await sourceHash(sourceFile),passed}
 const temp=path+'.'+randomUUID()+'.tmp'
 await writeFile(temp,JSON.stringify(value));await rename(temp,path)
}
export async function waitForRoutingProof({path,runId,sourceFile,timeoutMs=110000}){
 const expected=await sourceHash(sourceFile),deadline=Date.now()+timeoutMs
 while(Date.now()<deadline){
  let proof
  try{proof=JSON.parse(await readFile(path,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  if(proof){
   if(proof.runId!==runId||proof.node!==process.version||proof.sourceHash!==expected||proof.passed!==true)throw Error('Routing proof failed or does not match this release invocation and source')
   return
  }
  await new Promise(resolve=>setTimeout(resolve,25))
 }
 throw Error('Routing verification did not finish before the release deadline')
}
