// Filters run first so any matching relationship can connect the pair.
export function uniqueNetworkLinks(edges) {
 const pairs=new Set()
 return edges.filter(edge=>{
  const id=value=>typeof value==='object'?value.id:value
  const key=JSON.stringify([id(edge.source),id(edge.target)].sort())
  if(pairs.has(key))return false
  pairs.add(key)
  return true
 })
}
