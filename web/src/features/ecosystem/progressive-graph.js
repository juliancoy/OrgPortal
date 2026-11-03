const stateKeys=['x','y','z','vx','vy','vz','fx','fy','fz','q','velocityND']
// Metadata may change while the running layout owns positions and momentum.
export function retainLayoutNodes(previous,incoming){
 const byId=new Map(previous.map(n=>[n.id,n]))
 return incoming.map(next=>{
  const node=byId.get(next.id)
  if(!node)return {...next}
  const state=Object.fromEntries(stateKeys.filter(key=>key in node).map(key=>[key,node[key]]))
  return Object.assign(node,next,state)
 })
}
export function progressiveGraph(snapshot){
 let count=0
 const nodes=snapshot.organizations,relationships=snapshot.relationships
 return {
  get pending(){return count<nodes.length},
  take(limit){
   count=Math.min(nodes.length,count+Math.max(1,limit))
   const organizations=nodes.slice(0,count),ids=new Set(organizations.map(n=>n.id))
   return {...snapshot,organizations,relationships:relationships.filter(e=>ids.has(e.source?.id||e.source)&&ids.has(e.target?.id||e.target))}
  },
 }
}
export function nextGraphFrame(signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return}
  // A timer fallback also permits completion in a background tab.
  let frame,timer
  const clear=()=>{cancelAnimationFrame(frame);clearTimeout(timer);signal.removeEventListener('abort',abort)}
  const done=()=>{clear();resolve()}
  const abort=()=>{clear();reject(new DOMException('Aborted','AbortError'))}
  frame=requestAnimationFrame(done);timer=setTimeout(done,100)
  signal.addEventListener('abort',abort,{once:true})
 })
}
