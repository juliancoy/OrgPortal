// Labels are at most 155px wide. Adjacent cells cover every possible overlap,
// preserving priority order and the original 8px horizontal / 28px vertical gaps.
export function createLabelGrid(){
 const rows=new Map(),cellWidth=163,cellHeight=28
 return {
  overlaps(x,y,width){
   const cx=Math.floor(x/cellWidth),cy=Math.floor(y/cellHeight)
   for(let rowIndex=cy-1;rowIndex<=cy+1;rowIndex++){
    const row=rows.get(rowIndex)
    if(!row)continue
    for(let column=cx-1;column<=cx+1;column++){
     const bucket=row.get(column)
     if(!bucket)continue
     for(const r of bucket)if(Math.abs(x-r.x)<(width+r.width)/2+8&&Math.abs(y-r.y)<28)return true
    }
   }
   return false
  },
  add(x,y,width){
   const cx=Math.floor(x/cellWidth),cy=Math.floor(y/cellHeight)
   let row=rows.get(cy)
   if(!row){row=new Map();rows.set(cy,row)}
   let bucket=row.get(cx)
   if(!bucket){bucket=[];row.set(cx,bucket)}
   bucket.push({x,y,width})
  },
 }
}
