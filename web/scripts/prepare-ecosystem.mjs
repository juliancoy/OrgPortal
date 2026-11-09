import {spawn} from 'node:child_process'
import {readFile,stat} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve,dirname,extname} from 'node:path'
import ts from 'typescript'
import {cachedStep} from './release-cache.mjs'

const root=fileURLToPath(new URL('..',import.meta.url))
export async function moduleInputs(entry,seen=new Set()){
 const path=resolve(entry)
 if(seen.has(path))return [...seen]
 seen.add(path)
 if(!/\.(?:mjs|js|ts|tsx)$/.test(path))return [...seen]
 const source=await readFile(path,'utf8')
 for(const imported of ts.preProcessFile(source,true,true).importedFiles){
  if(!imported.fileName.startsWith('.'))continue
  const base=resolve(dirname(path),imported.fileName)
  const candidates=[base,...['.ts','.tsx','.js','.mjs','.json','/index.ts','/index.js'].map(suffix=>base+suffix)]
  if(extname(base)==='.js')candidates.push(base.slice(0,-3)+'.ts',base.slice(0,-3)+'.tsx')
  let target
  for(const candidate of candidates)try{if((await stat(candidate)).isFile()){target=candidate;break}}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error}
  if(!target)throw Error('Cannot fingerprint imported generator input: '+base)
  await moduleInputs(target,seen)
 }
 return [...seen]
}
export async function prepareEcosystem(){
 const entry=resolve(root,'scripts/build-ecosystem-query.mjs')
 const run=()=>new Promise((yes,no)=>{const child=spawn(process.execPath,[entry],{cwd:root,stdio:'inherit',env:{...process.env,ORGPORTAL_REBUILD_ECOSYSTEM:'1'}});child.once('error',no);child.once('exit',code=>code===0?yes():no(Error('Ecosystem preparation failed ('+code+')')))})
 // Explicit snapshots are caller-selected inputs; never substitute a cached export.
 if(process.env.ORGPORTAL_ECOSYSTEM_BUILD_SNAPSHOT)return run()
 const seconds=Number(process.env.ORGPORTAL_ECOSYSTEM_CACHE_MAX_AGE_SECONDS??900)
 if(!Number.isFinite(seconds)||seconds<0||seconds>900)throw Error('Ecosystem cache freshness must be between 0 and 900 seconds')
 return cachedStep({root,inputs:[...await moduleInputs(entry),resolve(root,'src/features/ecosystem'),resolve(root,'scripts/prepare-ecosystem.mjs'),resolve(root,'scripts/release-cache.mjs'),resolve(root,'package-lock.json'),resolve(root,'../cloudflare/release-image.txt')],
  outputs:['public/ecosystem-data/query','public/ecosystem-data/query/manifest.json'],receipt:'../.local/release-cache/ecosystem.json',maxAgeMs:seconds*1000,
  refresh:process.env.ORGPORTAL_REFRESH_ECOSYSTEM==='1',context:{name:'ecosystem index',freshnessSeconds:seconds,timezone:process.env.TZ||'',locale:process.env.LANG||''},run})
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareEcosystem()
