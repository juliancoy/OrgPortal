import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {installPinnedQuerySnapshot} from '../web/scripts/pinned-query-snapshot.mjs'
import {digestPaths} from '../web/scripts/release-cache.mjs'
import {packFiscalMetrics} from '../web/scripts/pack-fiscal-metrics.mjs'
import {packedFiscalMetricReader} from '../web/server/packed-fiscal-metrics.mjs'

test('packed fiscal metrics reproduce every array exactly, preserve missing shards, and isolate versions',async t=>{
 const root=await mkdtemp(join(tmpdir(),'packed-metrics-'));t.after(()=>rm(root,{recursive:true,force:true}))
 const version='b'.repeat(24),manifest={version},path=join(root,version,'fiscal/2025/metrics')
 await mkdir(path,{recursive:true})
 const values=new Map([0,1,9,10,12].map(i=>[i,[{receivedUsd:i===0?null:-i,disbursedUsd:i,financialObservations:[]}]]))
 for(const [i,rows] of values)await writeFile(join(path,`${i}.json`),JSON.stringify(rows))
 await writeFile(join(root,'manifest.json'),JSON.stringify(manifest))
 const packed=await packFiscalMetrics(root,manifest)
 assert.equal(packed.fiscalMetricPacking,10)
 const read=packedFiscalMetricReader(async key=>JSON.parse(await readFile(join(root,key),'utf8')))
 await read('manifest.json')
 for(const [i,rows] of values)assert.deepEqual(await read(`${version}/fiscal/2025/metrics/${i}.json`),rows)
 await assert.rejects(read(`${version}/fiscal/2025/metrics/11.json`),/Missing packed/)
 await assert.rejects(read(`${'c'.repeat(24)}/fiscal/2025/metrics/0.json`),/ENOENT/)
 assert.deepEqual(await packFiscalMetrics(root,packed),packed)
 await assert.rejects(readFile(join(path,'0.json')),/ENOENT/)
 assert.equal(JSON.parse(await readFile(join(path,'packed-0.json'),'utf8'))['0'][0].receivedUsd,null)
})

test('explicit query snapshots preserve provenance and reject damage without replacing the working index',async t=>{
 const root=await mkdtemp(join(tmpdir(),'pinned-query-'));t.after(()=>rm(root,{recursive:true,force:true}))
 const source=join(root,'source'),target=join(root,'target'),version='a'.repeat(24)
 await mkdir(join(source,version),{recursive:true});await mkdir(target)
 const manifest={version,organizationEvidenceIndexVersion:1,generatedAt:'2026-11-24T00:00:00Z',transactionalCoverage:{exportedAt:'2026-11-23T23:59:00Z'}}
 await writeFile(join(source,'manifest.json'),JSON.stringify(manifest));await writeFile(join(source,version,'data.json'),'[]')
 const digest=await digestPaths(source,['.'])
 await installPinnedQuerySnapshot(source,target,digest)
 assert.deepEqual(JSON.parse(await readFile(join(target,'manifest.json'),'utf8')),manifest)
 await assert.rejects(installPinnedQuerySnapshot(source,target,''),/requires/)
 await writeFile(join(source,version,'data.json'),'[1]')
 await assert.rejects(installPinnedQuerySnapshot(source,target,digest),/checksum mismatch/)
 assert.equal(await readFile(join(target,version,'data.json'),'utf8'),'[]')
 await assert.rejects(installPinnedQuerySnapshot(source,source,digest),/separate directories/)
 await symlink(join(source,version,'data.json'),join(source,'link'))
 await assert.rejects(installPinnedQuerySnapshot(source,target,digest),/symbolic links/)
 await rm(join(source,'link'));await mkdir(join(source,'stale'))
 await assert.rejects(installPinnedQuerySnapshot(source,target,await digestPaths(source,['.'])),/exactly one version/)
 await rm(join(source,'stale'),{recursive:true});await writeFile(join(source,'manifest.json'),JSON.stringify({...manifest,version:'../escape'}))
 await assert.rejects(installPinnedQuerySnapshot(source,target,await digestPaths(source,['.'])),/Invalid pinned/)
})
