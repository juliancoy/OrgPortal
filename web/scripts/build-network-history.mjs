import {readFile,writeFile,readdir} from 'node:fs/promises'
import {key,safeUrl} from '../src/features/ecosystem/ecosystem.js'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=process.env.CODECOLLECTIVE_DIR || fileURLToPath(new URL('../../../CodeCollective/',import.meta.url))
const files=['upcoming_events.json']
for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isDirectory())for(const name of ['event_history.json','manual_events.json','upcoming_events.json'])files.push(`${entry.name}/${name}`)
const events=new Map(),organizations=new Map()
for(const file of files){
 let rows;try{rows=JSON.parse(await readFile(path.join(root,file),'utf8'))}catch(error){if(error.code==='ENOENT')continue;throw error}
 if(!Array.isArray(rows))throw new Error(`Expected event array: ${file}`)
 for(const row of rows){
  const url=safeUrl(row.url || row.source_url),date=row.startDate || row.starts_at || row.event_date || ''
  const title=row.name || row.title;if(!title || !url)continue
  const name=row.org_name || row.orgName || row.source_group || (/code[\s_-]*collective/i.test(url)?'Code Collective':'')
  const organizationId=name?`history-org-${key(name)}`:null
  if(name&&!organizations.has(organizationId))organizations.set(organizationId,{id:organizationId,name,type:'Community organization',category:'general',website:safeUrl(row.source_url || row.source),relevance:'Listed in Code Collective event sources.',directory:false,proximity:null,publicEmails:[],sourceRows:[],sourceCategory:'Code Collective event sources'})
  const id=JSON.stringify([url,date]);const existing=events.get(id)
  if(existing){if(!existing.archiveSources.includes(file))existing.archiveSources.push(file);continue}
  events.set(id,{id,title,date,sourceUrl:url,organizationId,organizationName:name,location:row.location?.name || row.location?.address || '',archiveSources:[file]})
 }
}
const curated=JSON.parse(await readFile(new URL('../public/ecosystem-data/ecosystem-research.json',import.meta.url)))
const result={updatedAt:new Date().toISOString(),organizations:[...organizations.values(),...curated.organizations],events:[...events.values()].sort((a,b)=>b.date.localeCompare(a.date)),relationships:curated.relationships,financing:curated.financing}
await writeFile(new URL('../public/ecosystem-data/ecosystem-history.json',import.meta.url),JSON.stringify(result)+'\n')
console.log(`Collected ${result.events.length} event occurrences across ${organizations.size} source organizations`)
