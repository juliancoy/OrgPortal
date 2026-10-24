export type ChangeBlock = { start: number; end: number; text: string[]; unchanged: boolean }

// Paragraph-level LCS keeps clauses together, including insertions and deletions.
export function compareParagraphs(target: string, source: string): ChangeBlock[] {
 const a=target ? target.split('\n\n') : [], b=source ? source.split('\n\n') : []
 // Bound worst-case work for manually pasted documents.
 if(a.length*b.length>250000)return [{start:0,end:a.length,text:b,unchanged:target===source}]
 const sameClause=(left:string,right:string)=>left===right||(left.includes('\n')&&right.includes('\n')&&left.split('\n',1)[0]===right.split('\n',1)[0])
 const lengths=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1))
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)lengths[i][j]=sameClause(a[i],b[j])?lengths[i+1][j+1]+1:Math.max(lengths[i+1][j],lengths[i][j+1])
 const blocks:ChangeBlock[]=[]
 let i=0,j=0
 while(i<a.length||j<b.length){
  if(i<a.length&&j<b.length&&sameClause(a[i],b[j])){blocks.push({start:i,end:i+1,text:[b[j]],unchanged:a[i]===b[j]});i++;j++;continue}
  const start=i,text:string[]=[]
  while((i<a.length||j<b.length)&&!(i<a.length&&j<b.length&&sameClause(a[i],b[j]))){
   if(j<b.length&&(i===a.length||lengths[i][j+1]>=lengths[i+1][j]))text.push(b[j++]);else i++
  }
  blocks.push({start,end:i,text,unchanged:false})
 }
 return blocks
}

export function acceptBlock(target:string,block:ChangeBlock):string {
 const paragraphs=target?target.split('\n\n'):[]
 return [...paragraphs.slice(0,block.start),...block.text,...paragraphs.slice(block.end)].join('\n\n')
}
