import {isNotApplicableNode} from '../src/features/ecosystem/node-classes.js'
// Relevance uses transaction topology, never dollar totals or names as identities.
export function graphRelevance(index,topology,ids,selected,distances=new Map(),limit=ids.length){
 ids=ids.filter(i=>index.rows[i].id===selected||!isNotApplicableNode(index.rows[i]))
 const nodeId=value=>typeof value==='number'?topology.nodeIds[value]:value
 const direct=new Map(),neighbors=new Set((topology.adjacency[selected]||[]).map(nodeId))
 if(selected)for(const i of topology.edgesByOrg[selected]||[]){
  const edge=topology.edges[i],a=nodeId(edge[0]),b=nodeId(edge[1]),other=a===selected?b:a
  direct.set(other,(direct.get(other)||0)+1)
 }
 const scores=new Map(ids.map(i=>{
  const id=index.rows[i].id
  return [i,{connections:topology.degree[id]||0,transactionRows:topology.edgesByOrg[id]?.length||0,
   distance:selected?(distances.get(id)??null):null,selectedNodeTransactions:direct.get(id)||0,
   sharedCounterparties:selected?(topology.adjacency[id]||[]).filter(value=>neighbors.has(nodeId(value))).length:0}]
 }))
 let ordered=[...ids].sort((a,b)=>{
  const x=scores.get(a),y=scores.get(b)
  return Number(index.rows[b].id===selected)-Number(index.rows[a].id===selected)
   ||(selected?((x.distance??Infinity)-(y.distance??Infinity)||y.selectedNodeTransactions-x.selectedNodeTransactions||y.sharedCounterparties-x.sharedCounterparties):0)
   ||y.connections-x.connections||y.transactionRows-x.transactionRows||index.rows[a].id.localeCompare(index.rows[b].id)
 })
 if(!selected){
  // Pure degree can yield only disconnected agencies. Grow a connected prefix
  // from the strongest hub, preferring the most connected eligible neighbor.
  const byId=new Map(ids.map(i=>[index.rows[i].id,i])),frontier=new Set(),chosen=new Set(),prefix=[]
  while(prefix.length<Math.min(limit,ordered.length)){
   const next=ordered.find(i=>!chosen.has(i)&&frontier.has(i))??ordered.find(i=>!chosen.has(i))
   chosen.add(next);prefix.push(next);frontier.delete(next)
   for(const value of topology.adjacency[index.rows[next].id]||[]){const neighbor=byId.get(nodeId(value));if(neighbor!==undefined&&!chosen.has(neighbor))frontier.add(neighbor)}
  }
  ordered=[...prefix,...ordered.filter(i=>!chosen.has(i))]
 }
 return {ids:ordered,scores}
}

// Cover distinct directed pairs before taking repeated records from each pair.
export function spreadTransactionRows(candidates,topology){
 const pairs=new Map()
 for(const i of candidates){const edge=topology.edges[i],key=JSON.stringify([edge[0],edge[1]]);if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(i)}
 const rows=[],buckets=[...pairs.values()]
 let active=buckets
 for(let depth=0;active.length;depth++){
  const next=[]
  for(const bucket of active){rows.push(bucket[depth]);if(bucket.length>depth+1)next.push(bucket)}
  active=next
 }
 return {rows,pairs:pairs.size}
}
