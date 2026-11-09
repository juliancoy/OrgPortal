import {createHash,randomUUID} from 'node:crypto'
import {readFile,readdir,lstat,mkdir,rename,rm,writeFile} from 'node:fs/promises'
import {dirname,join,relative,resolve} from 'node:path'

export async function digestPaths(root,paths){
 const hash=createHash('sha256')
 async function visit(path){
  hash.update(relative(root,path)+'\0')
  let info
  try{info=await lstat(path)}catch(error){if(error.code!=='ENOENT')throw error;hash.update('missing\0');return}
  if(info.isSymbolicLink())throw Object.assign(Error('Cache inputs and outputs must not be symbolic links: '+path),{code:'CACHE_UNSAFE_PATH'})
  if(info.isDirectory()){
   hash.update('directory\0')
   for(const name of (await readdir(path)).sort())await visit(join(path,name))
  }else if(info.isFile())hash.update(createHash('sha256').update(await readFile(path)).digest())
  else throw Error('Unsupported cache input: '+path)
 }
 for(const path of [...new Set(paths)].sort())await visit(resolve(root,path))
 return hash.digest('hex')
}

export async function cachedStep({root,inputs,outputs,receipt,run,maxAgeMs=Infinity,refresh=false,context={},now=()=>Date.now(),log=console.log}){
 const key=createHash('sha256').update(JSON.stringify({schema:1,node:process.version,platform:process.platform,arch:process.arch,context,inputs:await digestPaths(root,inputs)})).digest('hex')
 const path=resolve(root,receipt)
 if(!refresh){
  try{
   const previous=JSON.parse(await readFile(path,'utf8')),age=now()-previous.startedAt
   if(previous.key===key&&age>=0&&age<maxAgeMs&&previous.outputs===await digestPaths(root,outputs)){
    log(`[release cache] Reusing verified ${context.name||'step'} from ${new Date(previous.finishedAt).toISOString()}`)
    return {reused:true,key}
   }
  }catch(error){if(error.code==='CACHE_UNSAFE_PATH')throw error;if(!['ENOENT','SyntaxError'].includes(error.code||error.name))log('[release cache] Cache unavailable; running checks/build normally')}
 }
 // A failed refresh must never leave a reusable passing receipt.
 await rm(path,{force:true})
 const startedAt=now()
 await run()
 for(const output of outputs){
  const info=await lstat(resolve(root,output))
  if(!info.isFile()&&!info.isDirectory()||info.isSymbolicLink())throw Error('Build/check output is missing or unsafe: '+output)
 }
 const finalKey=createHash('sha256').update(JSON.stringify({schema:1,node:process.version,platform:process.platform,arch:process.arch,context,inputs:await digestPaths(root,inputs)})).digest('hex')
 if(finalKey!==key)throw Error('Inputs changed while running; refusing to cache the result')
 const value={key,startedAt,finishedAt:now(),outputs:await digestPaths(root,outputs)}
 await mkdir(dirname(path),{recursive:true})
 const temporary=path+'.'+randomUUID()+'.tmp'
 await writeFile(temporary,JSON.stringify(value));await rename(temporary,path)
 return {reused:false,key}
}

export async function replaceDirectory(temporary,target){
 temporary=resolve(temporary);target=resolve(target)
 const backup=target+'.replaced-'+randomUUID();let previous=false
 try{await rename(target,backup);previous=true}catch(error){if(error.code!=='ENOENT')throw error}
 try{await rename(temporary,target)}catch(error){if(previous)await rename(backup,target);throw error}
 if(previous)await rm(backup,{recursive:true,force:true})
}
