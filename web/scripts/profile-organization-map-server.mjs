// Run in the local web container, against its immutable public query artifacts.
import {readFile} from 'node:fs/promises'
import {queryEcosystem} from '../server/ecosystem-query.mjs'
import {createArtifactBuffer} from '../server/ecosystem-artifact-buffer.mjs'
const reads=new Map(),start=performance.now(),before=process.cpuUsage()
const read=createArtifactBuffer(async key=>{
 const started=performance.now(),text=await readFile(new URL(`../public/ecosystem-data/query/${key}`,import.meta.url),'utf8')
 const row=reads.get(key)||{key,count:0,bytes:0,readMs:0};row.count++;row.bytes+=Buffer.byteLength(text);row.readMs+=performance.now()-started;reads.set(key,row)
 return text
})
const pages=[],org='source-label:maryland_comptroller:agency:14aa88b77dfd301a1a96d03621dbdb9e'
let offset=0,version
do {
 const started=performance.now(),result=await queryEcosystem(read,'organization-map',new URLSearchParams({org,limit:'250',offset:String(offset),...(version?{version}:{})}))
 if(result.status)throw Error(JSON.stringify(result))
 const page=result.body;version=page.version
 pages.push({offset,ms:performance.now()-started,nodes:page.organizations.length,total:page.total,bytes:Buffer.byteLength(JSON.stringify(page))})
 offset=page.nextOffset
}while(offset!==null)
const cpu=process.cpuUsage(before)
console.log(JSON.stringify({version,wallMs:performance.now()-start,cpuMs:(cpu.user+cpu.system)/1000,memory:process.memoryUsage(),pages,filesRead:reads.size,totalReads:[...reads.values()].reduce((sum,r)=>sum+r.count,0),bytesRead:[...reads.values()].reduce((sum,r)=>sum+r.bytes,0),largestReads:[...reads.values()].sort((a,b)=>b.bytes-a.bytes).slice(0,8)},null,2))
