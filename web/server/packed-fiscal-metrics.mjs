// Storage packing does not change row positions or public query results.
export function packedFiscalMetricReader(read){
 const packing=new Map()
 return async key=>{
  if(key==='manifest.json'){
   const manifest=await read(key)
   if(manifest.fiscalMetricPacking!==undefined&&manifest.fiscalMetricPacking!==10)throw Error('Unsupported fiscal metric packing')
   packing.set(manifest.version,manifest.fiscalMetricPacking)
   if(packing.size>4)packing.delete(packing.keys().next().value)
   return manifest
  }
  const match=key.match(/^([a-f0-9]{24})\/fiscal\/(\d{4}|unassigned)\/metrics\/(\d+)\.json$/)
  if(!match||packing.get(match[1])!==10)return read(key)
  const index=Number(match[3]),rows=await read(`${match[1]}/fiscal/${match[2]}/metrics/packed-${Math.floor(index/10)}.json`)
  if(!Object.hasOwn(rows,String(index%10))||!Array.isArray(rows[index%10]))throw Error('Missing packed fiscal metrics')
  return rows[index%10]
 }
}
