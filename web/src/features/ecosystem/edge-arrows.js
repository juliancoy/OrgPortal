const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y,(b.z||0)-(a.z||0))
const interpolate=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:(a.z||0)+((b.z||0)-(a.z||0))*t})
/** Reserve a tapered head instead of drawing a thick shaft through the arrow tip. */
export function edgeArrowGeometry(points,requestedWidth=1.4,directional=false){
 const lengths=points.slice(1).map((p,i)=>distance(points[i],p)),total=lengths.reduce((s,n)=>s+n,0)
 const width=Math.min(Math.max(.1,requestedWidth),Math.max(.1,total*.12))
 if(!directional||total<.001)return {shaft:points,width,head:null}
 const headLength=Math.min(total*.45,Math.max(10,width*2.2)),cut=total-headLength
 const at=value=>{let offset=0;for(let i=0;i<lengths.length;i++){if(offset+lengths[i]>=value&&lengths[i]>0)return interpolate(points[i],points[i+1],(value-offset)/lengths[i]);offset+=lengths[i]}return points.at(-1)}
 const base=at(cut),tip=points.at(-1),length=distance(base,tip)||.001
 const direction={x:(tip.x-base.x)/length,y:(tip.y-base.y)/length,z:((tip.z||0)-(base.z||0))/length}
 // A fixed segment count also keeps partial GPU buffer updates stable.
 const shaft=points.map((_,i)=>at(cut*i/(points.length-1)))
 return {shaft,width,head:{base,tip,direction,length,halfWidth:Math.max(width*.9,headLength*.4)}}
}
