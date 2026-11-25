import {readdir,readFile,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'

// Combine ten physical metric files; retain each original array verbatim.
export async function packFiscalMetrics(folder,manifest){
 if(manifest.fiscalMetricPacking===10)return manifest
 if(manifest.fiscalMetricPacking!==undefined)throw Error('Unsupported fiscal metric packing')
 const fiscal=join(folder,manifest.version,'fiscal')
 let years
 try{years=await readdir(fiscal)}catch(error){if(error.code==='ENOENT')return manifest;throw error}
 let before=0,after=0
 for(const year of years){
  if(!/^(\d{4}|unassigned)$/.test(year))throw Error('Unexpected fiscal artifact directory')
  const path=join(fiscal,year,'metrics');let names
  try{names=await readdir(path)}catch(error){if(error.code==='ENOENT')continue;throw error}
  const groups=new Map()
  for(const name of names){
   if(!/^\d+\.json$/.test(name))throw Error('Unexpected fiscal metric file')
   const index=Number(name.slice(0,-5)),group=Math.floor(index/10)
   if(!groups.has(group))groups.set(group,[])
   groups.get(group).push({name,index})
  }
  for(const [group,files] of groups){
   const packed={}
   for(const {name,index} of files){
    const rows=JSON.parse(await readFile(join(path,name),'utf8'))
    if(!Array.isArray(rows))throw Error('Invalid fiscal metric array')
    packed[index%10]=rows
   }
   const output=JSON.stringify(packed)
   if(Buffer.byteLength(output)>16*1024*1024)throw Error('Packed fiscal metrics exceed artifact size limit')
   await writeFile(join(path,`packed-${group}.json`),output)
   for(const {name} of files)await rm(join(path,name))
   before+=files.length;after++
  }
 }
 const result={...manifest,fiscalMetricPacking:10}
 await writeFile(join(folder,'manifest.json'),JSON.stringify(result))
 console.log(JSON.stringify({fiscalMetricFilesBefore:before,fiscalMetricFilesAfter:after,recordsRemoved:0}))
 return result
}
