// Shared wrapping keeps the flat and curved surface titles consistent.
export function sphereTitleLines(title,columns=18,maxLines=5){
 const words=String(title||'').trim().split(/\s+/).filter(Boolean).flatMap(word=>{
  const chars=Array.from(word),chunks=[]
  for(let i=0;i<chars.length;i+=columns)chunks.push(chars.slice(i,i+columns).join(''))
  return chunks
 }),lines=[]
 for(const word of words){const last=lines.length-1;if(last>=0&&Array.from(lines[last]+' '+word).length<=columns)lines[last]+=' '+word;else lines.push(word)}
 if(lines.length>maxLines){lines.length=maxLines;lines[maxLines-1]=Array.from(lines[maxLines-1]).slice(0,columns-1).join('')+'…'}
 return lines
}
export function paintSphereTitle(context,title,x,y,width,height){
 const lines=sphereTitleLines(title)
 if(!lines.length)return
 const size=Math.min(height/(lines.length*1.18),width/(Math.max(...lines.map(line=>Array.from(line).length))*.64))
 context.save();context.font=`600 ${size}px sans-serif`;context.textAlign='center';context.textBaseline='middle';context.lineJoin='round'
 context.strokeStyle='rgba(0,0,0,.85)';context.fillStyle='#fff';context.lineWidth=size*.16
 lines.forEach((line,i)=>{const top=y+(i-(lines.length-1)/2)*size*1.18;context.strokeText(line,x,top);context.fillText(line,x,top)})
 context.restore()
}
