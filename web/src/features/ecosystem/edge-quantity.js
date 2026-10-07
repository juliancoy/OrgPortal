// Compare like goods only; unknown quantities never imply zero.
export function quantityEdgeWidths(edges, enabled = true) {
 const quantities=new Map(), maxima=new Map()
 for(const edge of edges){
  const value=edge.quantity ?? edge.amount
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0)continue
  const unit=edge.quantityUnit || edge.unit || edge.currency || (/\$/.test(edge.amountLabel||'')?'USD':'unspecified')
  const key=JSON.stringify([edge.kind || edge.relationship || 'relationship',unit])
  quantities.set(edge.id,{value,key});maxima.set(key,Math.max(maxima.get(key)||0,value))
 }
 return new Map(edges.map(edge=>{const q=quantities.get(edge.id);return [edge.id,enabled&&q?1+5*Math.sqrt(q.value/maxima.get(q.key)):1.4]}))
}
