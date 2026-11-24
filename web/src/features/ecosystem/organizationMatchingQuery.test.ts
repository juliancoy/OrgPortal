// @ts-expect-error Read-only Node query implementation has no declaration.
import {queryEcosystem} from '../../../server/ecosystem-query.mjs'
import {it,expect} from 'vitest'
const nodes=['Johns Hopkins University','The Johns Hopkins University','John Hopkins University','Johns Hopkins Hospital','Johns Hopkins University Foundation'].map((name,i)=>({id:String(i),name,type:'Organization',search:name.toLowerCase()}))
function reader(rows=nodes,compact=true){
 const reads:string[]=[]
 return {reads,read:async(path:string)=>{reads.push(path);if(path==='manifest.json')return {version:'fixture'};if(path==='fixture/directory/index.json')return {rows:rows.map(n=>compact?n:{id:n.id,search:n.search})};const page=Number(path.match(/directory\/(\d+)\.json$/)?.[1]);if(Number.isInteger(page))return rows.slice(page*25,page*25+25);throw Error('Unexpected detail read '+path)}}
}
it('ranks fuzzy source names without treating hospitals or foundations as the university',async()=>{
 const {read,reads}=reader();const result=await queryEcosystem(read,'organizations',new URLSearchParams({q:'Johns Hopkins University',match:'fuzzy',limit:'2'}))
 expect(result.body.records.map((n:any)=>n.id)).toEqual(['0','1']);expect(result.body.nextOffset).toBe(2)
 const next=await queryEcosystem(read,'organizations',new URLSearchParams({q:'Johns Hopkins University',match:'fuzzy',offset:'2'}))
 expect(next.body.records.find((n:any)=>n.id==='2').match.automatic).toBe(true)
 for(const row of next.body.records.filter((n:any)=>['3','4'].includes(n.id)))expect(row.match.automatic).toBe(false)
 expect(reads.every(path=>!path.match(/directory\/\d/))).toBe(true)
})
it('bounds legacy detail reads and explicitly reports a truncated review window',async()=>{
 const many=Array.from({length:501},(_,i)=>({...nodes[0],id:String(i)}));const {read,reads}=reader(many,false)
 const result=await queryEcosystem(read,'organizations',new URLSearchParams({q:'Johns Hopkins University',match:'fuzzy'}))
 expect(result.body.total).toBe(500);expect(result.body.truncated).toBe(true)
 expect(reads.filter(path=>path.match(/directory\/\d/))).toHaveLength(20)
 await expect(queryEcosystem(read,'organizations',new URLSearchParams({q:'ab',match:'fuzzy'}))).rejects.toThrow('between 3 and 128')
})
