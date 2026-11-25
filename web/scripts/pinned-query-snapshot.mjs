import {cp,mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {dirname,join,resolve} from 'node:path'
import {digestPaths,replaceDirectory} from './release-cache.mjs'
import {packFiscalMetrics} from './pack-fiscal-metrics.mjs'

// Explicit code releases may retain a reviewed evidence snapshot. This is not
// a cache hit or a fresh export: its original manifest and dates stay unchanged.
export async function installPinnedQuerySnapshot(source,target,expected){
 source=resolve(source);target=resolve(target)
 if(!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Pinned query snapshot requires its SHA-256 tree digest')
 if(source===target||source.startsWith(target+'/')||target.startsWith(source+'/'))throw Error('Snapshot source and target must be separate directories')
 const digest=await digestPaths(source,['.']) // rejects symlinks, including nested ones
 if(digest!==expected)throw Error('Pinned query snapshot checksum mismatch')
 const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'))
 if(!/^[a-f0-9]{24}$/.test(manifest.version||'')||manifest.organizationEvidenceIndexVersion!==1||!manifest.transactionalCoverage?.exportedAt||!Number.isFinite(Date.parse(manifest.generatedAt)))throw Error('Invalid pinned query snapshot manifest')
 const names=(await readdir(source)).sort()
 if(JSON.stringify(names)!==JSON.stringify([manifest.version,'manifest.json'].sort()))throw Error('Pinned query snapshot must contain exactly one version and its manifest')
 await mkdir(dirname(target),{recursive:true})
 const temporary=await mkdtemp(join(dirname(target),'.pinned-query-'))
 try{
  await cp(source,temporary,{recursive:true})
  if(await digestPaths(temporary,['.'])!==expected)throw Error('Pinned query snapshot changed while copying')
  await packFiscalMetrics(temporary,manifest)
  await replaceDirectory(temporary,target)
 }finally{await rm(temporary,{recursive:true,force:true})}
 console.log(JSON.stringify({evidenceInput:'explicit-pinned-query',version:manifest.version,sha256:expected,generatedAt:manifest.generatedAt,exportedAt:manifest.transactionalCoverage.exportedAt}))
 return manifest
}
