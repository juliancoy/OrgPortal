import {endpoint} from './network-analysis.js'
// Ordered endpoints define a visual edge; every source row stays inspectable.
export function bundleRenderedEdges(edges,color,exponent=.5){
 exponent=Number.isFinite(exponent)?Math.max(.1,Math.min(1,exponent)):.5
 const bundles=new Map()
 for(const edge of edges){
  const key=JSON.stringify([endpoint(edge.source),endpoint(edge.target)])
  const bundle=bundles.get(key)
  if(bundle)bundle.records.push(edge)
  else bundles.set(key,{...edge,curveOffset:0,records:[edge]})
 }
 return [...bundles.values()].map(bundle=>{
  const records=bundle.records,first=records[0],mixed=records.some(r=>r.kind!==first.kind||r.relationship!==first.relationship)
  const colors=new Set(records.map(color))
  return {...bundle,recordCount:records.length,quantityWidth:Math.max(...records.map(r=>r.quantityWidth||1.4))*records.length**exponent,
   opacity:Math.max(...records.map(r=>r.opacity??.2)),directional:records.every(r=>r.directional),bundleColor:colors.size===1?color(first):0x77878c,
   ...(mixed?{kind:'mixed',relationship:'mixed',type:'Mixed transaction records',amount:undefined,amountLabel:undefined,currency:undefined}:{})}
 })
}

// Repeated evidence records should not multiply the same physical spring.
export function layoutConnections(edges){
 const pairs=new Set()
 return edges.filter(edge=>{const key=JSON.stringify([endpoint(edge.source),endpoint(edge.target)].sort());if(pairs.has(key))return false;pairs.add(key);return true})
}
