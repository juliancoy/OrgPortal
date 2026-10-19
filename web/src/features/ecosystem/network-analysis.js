// Dataset-scoped indices: no traversal or community detection in the frame loop.
export const endpoint = value => typeof value === 'object' ? value?.id : value
export function financialEvidence(edge) {
 const kind=edge.kind || edge.relationship
 const uncertain=/inferred|shared|coinvest|portfolio|capitalization/i.test(kind || '') || edge.inferred===true
 const directed=!uncertain && ['transfer','grant','donation','contract'].includes(kind) && edge.status!=='voided'
 const amount=directed && edge.currency==='USD' && Number.isFinite(edge.amount) && edge.amount>=0 ? edge.amount : null
 return {directed,amount,kind:kind || 'unspecified',verified:directed && edge.status==='verified'}
}
export function createNetworkAnalysis(nodes,edges) {
 const byId=new Map(nodes.map(n=>[n.id,n])),adjacency=new Map(nodes.map(n=>[n.id,new Set()])),incoming=new Map(),outgoing=new Map()
 for(const edge of edges){
  const a=endpoint(edge.source),b=endpoint(edge.target)
  if(!byId.has(a)||!byId.has(b))continue
  adjacency.get(a).add(b);adjacency.get(b).add(a)
  const evidence=financialEvidence(edge)
  if(evidence.amount!==null){outgoing.set(a,(outgoing.get(a)||0)+evidence.amount);incoming.set(b,(incoming.get(b)||0)+evidence.amount)}
 }
 const neighborhoods=new Map(),groups=new Map()
 return {byId,adjacency,incoming,outgoing,
  neighborhood(id,depth=1){
   depth=Math.max(1,Math.min(3,Math.floor(depth)||1));const key=JSON.stringify([id,depth])
   if(neighborhoods.has(key))return neighborhoods.get(key)
   const found=new Set(byId.has(id)?[id]:[]);let frontier=[...found]
   for(let hop=0;hop<depth;hop++){const next=[];for(const a of frontier)for(const b of adjacency.get(a)||[])if(!found.has(b)){found.add(b);next.push(b)}frontier=next}
   neighborhoods.set(key,found);return found
  },
  communities(mode='community'){
   if(groups.has(mode))return groups.get(mode)
   const membership=new Map()
   if(mode==='community'){
    // Deterministic asynchronous label propagation, bounded to 20 sweeps.
    const order=[...byId.keys()].sort();order.forEach(id=>membership.set(id,id))
    for(let pass=0;pass<20;pass++){let changed=false
     for(const id of order){const votes=new Map();for(const neighbor of adjacency.get(id)){const label=membership.get(neighbor);votes.set(label,(votes.get(label)||0)+1)}
      if(!votes.size)continue
      const best=[...votes].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0]
      if(best!==membership.get(id)){membership.set(id,best);changed=true}
     }if(!changed)break
    }
   }else for(const node of nodes)membership.set(node.id,mode==='sector'?(node.sector || node.category || 'Unknown sector'):(node.county || node.municipality || node.city || 'Unknown location'))
   const clusters=new Map()
   for(const node of nodes){const id=membership.get(node.id);if(!clusters.has(id))clusters.set(id,{id,members:[],internal:0,external:0});clusters.get(id).members.push(node.id)}
   for(const edge of edges){const a=membership.get(endpoint(edge.source)),b=membership.get(endpoint(edge.target));if(!clusters.has(a)||!clusters.has(b))continue;if(a===b)clusters.get(a).internal++;else{clusters.get(a).external++;clusters.get(b).external++}}
   const result={membership,clusters};groups.set(mode,result);return result
  },
 }
}
export function metricRadius(value,max){return 3+7*Math.sqrt(Math.max(0,value||0)/Math.max(1,max||0))}
export function disclosure(analysis,edges,{mode='overview',selected=null,depth=1,grouping='community',expanded=new Set()}={}){
 const focus=selected?analysis.neighborhood(selected,depth):new Set(),{membership,clusters}=analysis.communities(grouping)
 const representatives=new Set()
 for(const group of clusters.values())representatives.add([...group.members].sort((a,b)=>analysis.adjacency.get(b).size-analysis.adjacency.get(a).size||a.localeCompare(b))[0])
 const edgeIds=new Set(),pairs=new Set()
 for(const edge of edges){const a=endpoint(edge.source),b=endpoint(edge.target)
  if(mode==='focus'){if(focus.has(a)&&focus.has(b))edgeIds.add(edge.id)}
  else if(mode==='all')edgeIds.add(edge.id)
  else{
   const ga=membership.get(a),gb=membership.get(b)
   if(expanded.has(ga)||expanded.has(gb)){edgeIds.add(edge.id);continue}
   if(ga!==gb){const pair=JSON.stringify([ga,gb].sort());if(!pairs.has(pair)){pairs.add(pair);edgeIds.add(edge.id)}}
  }
 }
 return {edgeIds,focus,membership,clusters,representatives}
}
