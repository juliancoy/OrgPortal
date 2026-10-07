export function transactionVisibility(count, zoom, factor = 4) {
 return Math.max(0, count) * Math.max(.01, zoom) ** 2 >= factor
}
export function transactionCounts(edges) {
 const counts=new Map()
 for(const edge of edges){const source=edge.source?.id || edge.source,target=edge.target?.id || edge.target;for(const id of new Set([source,target]))if(id)counts.set(id,(counts.get(id)||0)+1)}
 return counts
}
