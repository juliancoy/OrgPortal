// Leave headroom below the chosen frame-time limit. Never starve a node.
export function frameTargetMs(minimumFPS=10){
 const fps=Number.isFinite(minimumFPS)?Math.max(1,Math.min(120,minimumFPS)):10
 return 1000/fps
}
export function createFrameBudget(initial=256){
 let budget=initial,average=0
 return {
  count(total){return Math.min(total,Math.max(1,Math.floor(budget)))},
  observe(milliseconds,total,minimumFPS=10){
   const limit=frameTargetMs(minimumFPS)
   if(!Number.isFinite(milliseconds)||milliseconds<=0)return
   average=average?average*.7+milliseconds*.3:milliseconds
   if(milliseconds>limit||average>limit*.8)budget=Math.max(1,Math.floor(budget*.65))
   else if(average<limit*.7)budget=Math.min(Math.max(1,total),Math.max(budget+1,Math.ceil(budget*1.08)))
  },
  reset(){average=0},
 }
}
// Latest snapshot only. Keep the cursor when superseded so every node gets a turn.
export function createPositionQueue(){
 let latest=null,remaining=0,cursor=0
 return {
  offer(data,total){latest=data;remaining=total},
  pending(){return remaining>0},
  take(total,budget,apply){
   const ids=[];if(!latest||!total||budget<=0)return ids
   const count=Math.min(remaining,total,Math.max(1,Math.floor(budget)))
   for(let j=0;j<count;j++){const i=cursor%total;apply(latest,i);ids.push(i);cursor=(i+1)%total}
   remaining-=count;return ids
  },
 }
}
export function createFrameRate(){
 let start=null,frames=0,last=null,fps=null
 return {
  frame(now){if(last!==null&&now-last>1000){start=null;frames=0;fps=null}if(start===null)start=now;frames++;last=now;if(now-start>=500){fps=frames*1000/(now-start);frames=0;start=now}return fps},
  value(now){return last===null||now-last>1000?null:fps},
  reset(){start=null;frames=0;last=null;fps=null},
 }
}
