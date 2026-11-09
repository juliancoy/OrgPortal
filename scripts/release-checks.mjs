import {spawn,execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import {rm,mkdir} from 'node:fs/promises'
import {cachedStep} from '../web/scripts/release-cache.mjs'
import {writeRoutingProof} from './routing-proof.mjs'

function launch(root,args,extraEnv={}){
 return new Promise((yes,no)=>{
  const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,...extraEnv}})
  child.once('error',no);child.once('exit',code=>code===0?yes():no(Error(args.join(' ')+' failed ('+code+')')))
 })
}
export async function concurrentWebChecks({root,run=launch}){
 const runId=randomUUID(),proof=resolve(root,'.local/release-cache/routing-'+runId+'.json')
 const sourceFile=resolve(root,'cloudflare/ecosystem-query.test.mjs')
 await mkdir(resolve(root,'.local/release-cache'),{recursive:true})
 const routing=run(root,['scripts/test-status.mjs','capture','routing']).then(
  ()=>writeRoutingProof(proof,{runId,sourceFile,passed:true}),
  async error=>{await writeRoutingProof(proof,{runId,sourceFile,passed:false});throw error})
 const web=run(root,['scripts/test-status.mjs','capture','web'],{
  ORGPORTAL_ROUTING_PROOF:proof,ORGPORTAL_ROUTING_RUN_ID:runId})
 try{
  const results=await Promise.allSettled([routing,web])
  const failed=results.filter(result=>result.status==='rejected')
  if(failed.length)throw new AggregateError(failed.map(result=>result.reason),'Release checks failed')
  // Reconcile the public status snapshot once both independent writers finish.
  await run(root,['scripts/test-status.mjs','refresh'])
 }finally{await rm(proof,{force:true})}
}
export function trackedInputs(root){
 const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)
 // Submodules need their working files as well as their pinned commit.
 const modules=execFileSync('git',['ls-files','--stage'],{cwd:root,encoding:'utf8'}).split('\n').filter(line=>line.startsWith('160000 '))
 const modulePins=[]
 for(const line of modules){
  const path=line.split('\t')[1]
  const moduleRoot=resolve(root,path)
  let initialized=false
  try{initialized=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:moduleRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()===moduleRoot}catch{}
  modulePins.push(line+(initialized?':initialized':':uninitialized'))
  const index=paths.indexOf(path);if(index>=0)paths.splice(index,1)
  if(!initialized){paths.push(path);continue}
  try{
   const nested=trackedInputs(moduleRoot)
   for(const child of nested.paths)paths.push(path+'/'+child)
   modulePins.push(...nested.modulePins.map(pin=>path+':'+pin))
  }catch{throw Error('Cannot fingerprint test inputs in submodule '+path)}
 }
 return {paths,modulePins}
}
export async function checkWebRelease(root){
 const {paths,modulePins}=trackedInputs(root)
 const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(VITE_|PIDP_|ORG_API_|CHAT_API_|GOVERNANCE_|CI$|NODE_ENV$|TZ$|LANG$|LC_)/.test(key)).sort())
 return cachedStep({root,inputs:[...paths,'.env','.env.local','.env.test','.env.test.local','web/.env','web/.env.local','web/.env.test','web/.env.test.local','org-worker/src/generated','chat-worker/src/generated'],
  outputs:['.local/test-status'],receipt:'.local/release-cache/web-checks.json',maxAgeMs:15*60*1000,
  refresh:process.env.ORGPORTAL_RELEASE_FRESH_CHECKS==='1',context:{name:'frontend and routing checks',modulePins,environment},
  run:()=>concurrentWebChecks({root})})
}
