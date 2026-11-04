export function directionFixture(childCount=1){
 const organizations=[['a','Alpha',-40,40],['b','Beta',0,0],['d','Delta',-40,-40],['e','Epsilon',-80,40],...Array.from({length:childCount},(_,i)=>['g'+i,'Gamma '+i,60+i*5,0])].map(([id,name,x,y])=>({id,name,category:'company',networkMetrics:{recordCount:20},positions:{'2d':{x,y},'3d':{x,y,z:0},'4d':{q:[x,y,0,0],velocityND:[0,0,0,0]}}}))
 const relationships=[['a','b'],['d','b'],['e','a'],...Array.from({length:childCount},(_,i)=>['b','g'+i])].map(([source,target],i)=>({id:'r'+i,source,target,kind:'agency',relationship:'affiliation'}))
 const topology={edges:relationships.map(r=>[r.source,r.target,r.kind]),adjacency:Object.fromEntries(organizations.map(o=>[o.id,[]])),edgesByOrg:Object.fromEntries(organizations.map(o=>[o.id,[]])),degree:{}}
 relationships.forEach((r,i)=>{for(const [a,b] of [[r.source,r.target],[r.target,r.source]]){topology.adjacency[a].push(b);topology.edgesByOrg[a].push(i)}})
 for(const o of organizations)topology.degree[o.id]=topology.adjacency[o.id].length
 const manifest={version:'fixture-v1',generatedAt:'2026-11-03T00:00:00Z',totals:{organizations:organizations.length,relationships:relationships.length},groups:{},metricMax:{}}
 const read=async path=>{
  if(path==='manifest.json')return manifest
  if(path.endsWith('/topology.json'))return topology
  if(path.endsWith('/organizations/index.json'))return {rows:organizations.map(o=>({id:o.id,search:o.name.toLowerCase()})),filters:{},grams:{}}
  const match=path.match(/\/(organizations|graph)\/(\d+)\.json$/)
  if(match){const start=Number(match[2])*25;return (match[1]==='organizations'?organizations:relationships).slice(start,start+25)}
  throw Error('Unknown fixture path '+path)
 }
 return {read,organizations,relationships,topology}
}
