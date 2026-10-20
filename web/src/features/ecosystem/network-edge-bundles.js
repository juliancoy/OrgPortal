import {endpoint} from './network-analysis.js'
// Repeated records with identical visual semantics share geometry, retaining IDs.
// Opposite directions, relationship kinds, financial widths and colors stay separate.
export function bundleRenderedEdges(edges,color){
 const bundles=new Map()
 for(const edge of edges){
  const key=JSON.stringify([endpoint(edge.source),endpoint(edge.target),edge.kind,edge.relationship,edge.quantityWidth,edge.opacity,edge.directional,color(edge)])
  const bundle=bundles.get(key)
  if(bundle)bundle.records.push(edge)
  else bundles.set(key,{...edge,curveOffset:0,records:[edge]})
 }
 return [...bundles.values()]
}

// Repeated evidence records should not multiply the same physical spring.
export function layoutConnections(edges){
 const pairs=new Set()
 return edges.filter(edge=>{const key=JSON.stringify([endpoint(edge.source),endpoint(edge.target)].sort());if(pairs.has(key))return false;pairs.add(key);return true})
}
