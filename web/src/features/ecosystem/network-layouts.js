import {endpoint,financialEvidence} from './network-analysis.js'
export function geographicPoint(node){
 if(node.state&&!['MD','MARYLAND'].includes(String(node.state).toUpperCase()))return null
 const latitude=node.latitude,longitude=node.longitude
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<37.8||latitude>40||longitude< -79.6||longitude> -75)return null
 // Published coordinates only. No geocoding or inferred county centroids.
 return {x:(longitude+77.3)*230*Math.cos(39*Math.PI/180),y:-(latitude-39)*230,z:0}
}
export function analyticalLayout(nodes,edges,mode,{kind='all',category='all',from='',to='',grouping='community',expanded=new Set()}={}){
 if(mode==='geography'){
  const located=new Map();for(const node of nodes){const point=geographicPoint(node);if(point)located.set(node.id,point)}
  const positions=new Map(located),nodeMapping=new Map([...located.keys()].map(id=>[id,id])),geographicGroups=new Map(),groups=new Map()
  if(['county','municipality'].includes(grouping))for(const node of nodes){const label=grouping==='county'?node.county:node.municipality||node.city;if(!label||!located.has(node.id))continue;if(!groups.has(label))groups.set(label,[]);groups.get(label).push(node.id)}
  for(const [label,members] of groups){if(members.length<2||expanded.has(label))continue;members.sort();const rep=members[0],center={x:0,y:0,z:0};for(const id of members){center.x+=located.get(id).x/members.length;center.y+=located.get(id).y/members.length;positions.delete(id);nodeMapping.set(id,rep)}positions.set(rep,center);geographicGroups.set(rep,{id:label,label,members})}
  const edgeIds=new Set(edges.filter(e=>nodeMapping.has(endpoint(e.source))&&nodeMapping.has(endpoint(e.target))&&nodeMapping.get(endpoint(e.source))!==nodeMapping.get(endpoint(e.target))).map(e=>e.id))
  return {positions,nodeMapping,geographicGroups,locatedCount:located.size,edgeIds,missing:nodes.length-located.size,roles:new Map()}
 }
 const byId=new Map(nodes.map(n=>[n.id,n])),incoming=new Set(),outgoing=new Set()
 const flows=edges.filter(e=>{const evidence=financialEvidence(e),a=endpoint(e.source),b=endpoint(e.target);return evidence.directed&&byId.has(a)&&byId.has(b)&&(kind==='all'||evidence.kind===kind)&&(category==='all'||byId.get(a).category===category||byId.get(b).category===category)&&(!from||(e.date&&String(e.date)>=from))&&(!to||(e.date&&String(e.date).slice(0,10)<=to))})
 for(const edge of flows){outgoing.add(endpoint(edge.source));incoming.add(endpoint(edge.target))}
 const columns=[[],[],[]],roles=new Map(),positions=new Map()
 for(const node of nodes){const i=incoming.has(node.id)?outgoing.has(node.id)?1:2:outgoing.has(node.id)?0:-1;if(i<0)continue;columns[i].push(node);roles.set(node.id,['Funder','Intermediary','Recipient'][i])}
 columns.forEach((column,i)=>column.sort((a,b)=>a.name.localeCompare(b.name)).forEach((node,j)=>positions.set(node.id,{x:(i-1)*350,y:(j-(column.length-1)/2)*24,z:0})))
 return {positions,edgeIds:new Set(flows.map(e=>e.id)),missing:nodes.length-positions.size,roles}
}
