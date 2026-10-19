import {layoutConnections} from '../src/features/ecosystem/network-edge-bundles.js'
import {createNetworkAnalysis,metricRadius} from '../src/features/ecosystem/network-analysis.js'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {layoutNetwork} from '../src/features/ecosystem/ecosystem-physics.js'
import {layoutNetwork3D} from '../src/features/ecosystem/ecosystem-physics-3d.js'
import {createParticleLife4D} from '../src/features/ecosystem/particle-life-4d.js'
import {initializeNetworkPositions} from '../src/features/ecosystem/network-initial-positions.js'
import {applyFundHierarchy,foldFundNodes} from '../src/features/ecosystem/fund-pies.js'
import {mergeNetworkHistory,appendNonprofitEvidence} from '../src/features/ecosystem/network-history.js'
import {graphRelationships} from '../src/features/ecosystem/portal-ecosystem.js'
const root=new URL('../',import.meta.url),output=new URL('public/ecosystem-data/network-default-positions.json',root)
const inputs=['src/features/ecosystem/markup.html','src/ui/views/EcosystemNetworkPage.tsx','src/features/ecosystem/ecosystem-physics.js','src/features/ecosystem/ecosystem-physics-3d.js','src/features/ecosystem/particle-life-4d.js','src/features/ecosystem/force-law.js','src/features/ecosystem/network-initial-positions.js','src/features/ecosystem/fund-pies.js','src/features/ecosystem/portal-ecosystem.js','src/features/ecosystem/network-history.js','public/ecosystem-data/ecosystem-portal.json','public/ecosystem-data/ecosystem-relationships.json','public/ecosystem-data/ecosystem-nonprofits.json','scripts/build-network-positions.mjs','src/features/ecosystem/network-edge-bundles.js','src/features/ecosystem/network-analysis.js']
const contents=await Promise.all(inputs.map(path=>readFile(new URL(path,root),'utf8')))
const fingerprint=createHash('sha256').update(contents.join('\n')).digest('hex')
if(!process.argv.includes('--force')){try{const previous=JSON.parse(await readFile(output,'utf8'));if(previous.fingerprint===fingerprint){console.log('Default graph positions are current');process.exit(0)}}catch{}}
const markup=contents[0]+contents[1]
const value=id=>{
 const tag=markup.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))?.[0]
 if(tag)return tag.includes('type="checkbox"')?/\bchecked\b/.test(tag):tag.match(/\bvalue="([^"]*)"/)?.[1]
 const select=markup.match(new RegExp(`<select\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</select>`))?.[1]
 const options=[...(select||'').matchAll(/<option\b([^>]*)>/g)]
 return (options.find(m=>/\bselected\b/.test(m[1]))||options[0])?.[1].match(/value="([^"]*)"/)?.[1]
}
const options={live:true}
for(const [key,id] of Object.entries({attraction:'attraction',repulsion:'repulsion',proximity:'proximity',centralGravity:'central-gravity',dither:'dither',attractionAlpha:'attraction-alpha',repulsionAlpha:'repulsion-alpha',lifeRadius:'life-radius',lifeFriction:'life-friction',lifeSeed:'life-seed'}))options[key]=Number(value(id)??({lifeRadius:300,lifeFriction:.85,lifeSeed:1}[key]))
for(const key of ['attractionLaw','repulsionLaw'])options[key]=value(key==='attractionLaw'?'attraction-law':'repulsion-law')
const readJSON=path=>JSON.parse(contents[inputs.indexOf(path)])
const base=readJSON('public/ecosystem-data/ecosystem-portal.json')
const history=appendNonprofitEvidence(readJSON('public/ecosystem-data/ecosystem-relationships.json'),readJSON('public/ecosystem-data/ecosystem-nonprofits.json'))
const data=foldFundNodes(applyFundHierarchy(mergeNetworkHistory(base,history)))
const edges=graphRelationships(data,{moneyOnly:value('network-view')==='money',includeCapitalization:value('include-context')})
const layoutAnalysis=createNetworkAnalysis(data.organizations,edges),maxDegree=Math.max(1,...[...layoutAnalysis.adjacency.values()].map(n=>n.size))
const connected=new Set(edges.flatMap(e=>[e.source,e.target]))
const sizing={metric:'connections',minRadius:3,maxRadius:10}
const organizations=Object.fromEntries(data.organizations.map(n=>[n.id,{}]))
const diagnostics={}
for(const dimensions of [2,3,4]){
 const all=data.organizations.map(n=>({...n,renderRadius:metricRadius(layoutAnalysis.adjacency.get(n.id).size,maxDegree)}))
 initializeNetworkPositions(all,dimensions)
 const nodes=all.filter(n=>!value('hide-isolated')||connected.has(n.id))
 const ids=new Set(nodes.map(n=>n.id)),links=structuredClone(layoutConnections(edges.filter(e=>ids.has(e.source)&&ids.has(e.target))))
 const simulation=dimensions===4?createParticleLife4D(nodes,options):dimensions===3?layoutNetwork3D(nodes,links,options):layoutNetwork(nodes,links,n=>n.renderRadius,()=>({x:0,y:0}),options)
 const ticks=dimensions===4?360:480
 console.log(`Generating ${dimensions}D: ${nodes.length} organizations, ${links.length} links`)
 for(let i=0;i<ticks;i++){simulation.tick();if(dimensions!==4&&simulation.alpha()<=simulation.alphaMin())break}
 simulation.stop?.()
 // Hidden organizations have no physical influence, but retain a deterministic seed.
 if(dimensions===4)createParticleLife4D(all,options)
 let maxSpeed=0
 for(const node of all){
  const point=dimensions===4?{q:node.q,velocity4:[0,0,0,0]}:dimensions===3?{x:node.x,y:node.y,z:node.z}:{x:node.x,y:node.y}
  const coords=dimensions===4?point.q:Object.values(point)
  if(!coords.every(Number.isFinite))throw new Error(`Nonfinite position: ${node.id}`)
  maxSpeed=Math.max(maxSpeed,dimensions===4?Math.hypot(...node.velocity4):Math.hypot(node.vx,node.vy,node.vz||0))
  organizations[node.id][`${dimensions}d`]=point
 }
 diagnostics[`${dimensions}d`]={ticks,simulatedOrganizations:nodes.length,maxSpeed,kind:dimensions===4||options.dither>0?'fixed-warmup-snapshot':'cooled-layout'}
 console.log(`${dimensions}D: ${nodes.length} nodes, ${ticks} ticks`)
}
await writeFile(output,JSON.stringify({schemaVersion:1,fingerprint,sourceFiles:inputs,defaults:options,sizing,diagnostics,organizations})+'\n')
console.log(`Saved ${Object.keys(organizations).length} organization positions by graph type`)
