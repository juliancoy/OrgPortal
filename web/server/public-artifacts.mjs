// All tenant hosts use this deployment's public evidence snapshot. Stable readers
// let version-scoped topology/neighborhood caches work across paginated requests.
// There is no cross-binding cache and the manifest is always read afresh.
const readers=new WeakMap()
export function publicEvidenceReader(assets){
 if(!readers.has(assets))readers.set(assets,async key=>{
  const response=await assets.fetch(new Request(new URL(`/__portal_root/ecosystem-data/query/${key}`,'https://orgportal.cc')))
  if(!response.ok||!response.headers.get('content-type')?.includes('json'))throw Error('Missing query index')
  return response.json()
 })
 return readers.get(assets)
}
