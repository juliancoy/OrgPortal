import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {cachedStep} from '../web/scripts/release-cache.mjs'
import {writeRoutingProof,waitForRoutingProof} from '../scripts/routing-proof.mjs'
import {concurrentWebChecks} from '../scripts/release-checks.mjs'

async function fixture(t){const root=await mkdtemp(join(tmpdir(),'release-cache-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'input'),'source');return root}
test('warm artifact reuse requires unchanged inputs, intact outputs, and fresh evidence',async t=>{
 const root=await fixture(t);let calls=0,clock=1000
 const options={root,inputs:['input'],outputs:['output'],receipt:'cache/receipt.json',maxAgeMs:100,now:()=>clock,log:()=>{},run:async()=>{calls++;await writeFile(join(root,'output'),'verified')}}
 assert.equal((await cachedStep(options)).reused,false)
 assert.equal((await cachedStep(options)).reused,true);assert.equal(calls,1)
 await writeFile(join(root,'input'),'changed');await cachedStep(options);assert.equal(calls,2)
 await writeFile(join(root,'output'),'corrupt');await cachedStep(options);assert.equal(calls,3)
 await rm(join(root,'output'));await cachedStep(options);assert.equal(calls,4)
 clock+=101;await cachedStep(options);assert.equal(calls,5)
 await cachedStep({...options,refresh:true});assert.equal(calls,6)
})
test('failed refresh and changing inputs cannot leave a passing cache receipt',async t=>{
 const root=await fixture(t)
 const options={root,inputs:['input'],outputs:['output'],receipt:'receipt',run:async()=>writeFile(join(root,'output'),'ok')}
 await cachedStep(options)
 await assert.rejects(cachedStep({...options,refresh:true,run:async()=>{throw Error('failed')}}),/failed/)
 await assert.rejects(readFile(join(root,'receipt')),/ENOENT/)
 await assert.rejects(cachedStep({...options,run:async()=>{await writeFile(join(root,'input'),'changed during check')}}),/Inputs changed/)
 await assert.rejects(readFile(join(root,'receipt')),/ENOENT/)
})
test('source content and symlink substitution invalidate artifacts',async t=>{
 const root=await fixture(t)
 const options={root,inputs:['input'],outputs:['output'],receipt:'receipt',run:async()=>writeFile(join(root,'output'),'ok')}
 await cachedStep(options);await rm(join(root,'output'));await symlink(join(root,'input'),join(root,'output'))
 await assert.rejects(cachedStep(options))
 assert.equal(await readFile(join(root,'input'),'utf8'),'source')
})
test('routing proof is tied to invocation, runtime, source contents and passing execution',async t=>{
 const root=await fixture(t),path=join(root,'proof'),sourceFile=join(root,'input'),runId='this-run'
 await writeRoutingProof(path,{runId,sourceFile,passed:true})
 await waitForRoutingProof({path,runId,sourceFile,timeoutMs:100})
 await assert.rejects(waitForRoutingProof({path,runId:'other',sourceFile,timeoutMs:100}),/does not match/)
 await writeFile(sourceFile,'changed')
 await assert.rejects(waitForRoutingProof({path,runId,sourceFile,timeoutMs:100}),/does not match/)
 await writeRoutingProof(path,{runId,sourceFile,passed:false})
 await assert.rejects(waitForRoutingProof({path,runId,sourceFile,timeoutMs:100}),/failed/)
 await assert.rejects(waitForRoutingProof({path:join(root,'missing'),runId,sourceFile,timeoutMs:1}),/deadline/)
})
test('web and routing checks overlap, preserve failure, and clean up their proof',async t=>{
 const root=await fixture(t);await mkdir(join(root,'cloudflare'));await writeFile(join(root,'cloudflare/ecosystem-query.test.mjs'),'fixture')
 const started=[];let finishRouting,finishWeb,proofPath
 const pending=concurrentWebChecks({root,run:async(root,args,env)=>{
  started.push(args.at(-1))
  if(args.at(-1)==='routing')await new Promise(resolve=>{finishRouting=resolve})
  if(args.at(-1)==='web'){
   proofPath=env.ORGPORTAL_ROUTING_PROOF
   await new Promise(resolve=>{finishWeb=resolve})
   await waitForRoutingProof({path:proofPath,runId:env.ORGPORTAL_ROUTING_RUN_ID,sourceFile:join(root,'cloudflare/ecosystem-query.test.mjs')})
  }
 }})
 while(!finishWeb)await new Promise(resolve=>setTimeout(resolve,1))
 assert.deepEqual(started,['routing','web']);finishRouting();finishWeb();await pending
 await assert.rejects(readFile(proofPath),/ENOENT/);assert.equal(started.at(-1),'refresh')
 await assert.rejects(concurrentWebChecks({root,run:async(root,args)=>{if(args.at(-1)==='routing')throw Error('route failed')}}),/Release checks failed/)
})

test('replacement repairs existing artifacts and restores the old directory if publication fails',async t=>{
 const {replaceDirectory}=await import('../web/scripts/release-cache.mjs')
 const root=await fixture(t),old=join(root,'old'),next=join(root,'next')
 await mkdir(old);await writeFile(join(old,'data'),'damaged')
 await mkdir(next);await writeFile(join(next,'data'),'verified')
 await replaceDirectory(next,old+'/')
 assert.equal(await readFile(join(old,'data'),'utf8'),'verified')
 await assert.rejects(replaceDirectory(join(root,'missing'),old))
 assert.equal(await readFile(join(old,'data'),'utf8'),'verified')
})

test('successful commands without their required outputs cannot be cached',async t=>{
 const root=await fixture(t)
 await assert.rejects(cachedStep({root,inputs:['input'],outputs:['missing'],receipt:'receipt',run:async()=>{}}))
 await assert.rejects(readFile(join(root,'receipt')),/ENOENT/)
})

test('generator dependency discovery includes relative TS and JSON imports and handles cycles',async t=>{
 const {moduleInputs}=await import('../web/scripts/prepare-ecosystem.mjs')
 const root=await fixture(t)
 await writeFile(join(root,'entry.mjs'),"import './child.js'")
 await writeFile(join(root,'child.ts'),"import './entry.mjs'; import data from './data.json'")
 await writeFile(join(root,'data.json'),'{}')
 assert.deepEqual((await moduleInputs(join(root,'entry.mjs'))).sort(),['entry.mjs','child.ts','data.json'].map(p=>join(root,p)).sort())
})

test('uninitialized submodules are fingerprinted without recursing into the parent repository',async t=>{
 const {execFileSync}=await import('node:child_process')
 const {trackedInputs}=await import('../scripts/release-checks.mjs')
 const root=await fixture(t)
 execFileSync('git',['init','-q'],{cwd:root})
 await mkdir(join(root,'backend'))
 execFileSync('git',['update-index','--add','--cacheinfo','160000,'+'a'.repeat(40)+',backend'],{cwd:root})
 const result=trackedInputs(root)
 assert.ok(result.paths.includes('backend'))
 assert.ok(result.modulePins[0].endsWith(':uninitialized'))
})
