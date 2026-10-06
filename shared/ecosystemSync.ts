/** Public ecosystem records only; authorization belongs to the receiving API. */
export type EcosystemEntity = 'organization' | 'event' | 'funding'
export type EcosystemChange = {
  id: string
  entity: EcosystemEntity
  recordId: string
  replicaId: string
  counter: number
  deleted: boolean
  value: Record<string, unknown> | null
}
export type EcosystemState = Record<string, EcosystemChange>
export function validateChange(value: unknown): EcosystemChange {
  if (!value || typeof value !== 'object') throw new Error('Invalid ecosystem change')
  const c = value as EcosystemChange
  if (!['organization','event','funding'].includes(c.entity) || ![c.id,c.recordId,c.replicaId].every(v=>typeof v==='string'&&v.length>0&&v.length<=200) ||
    !Number.isSafeInteger(c.counter) || c.counter<1 || typeof c.deleted!=='boolean' ||
    (c.deleted ? c.value!==null : !c.value || typeof c.value!=='object' || Array.isArray(c.value))) throw new Error('Invalid ecosystem change')
  if(JSON.stringify(c).length>100000)throw new Error('Ecosystem record is too large')
  return c
}
export function changeKey(change: EcosystemChange) { return `${change.entity}:${change.recordId}` }
export function compareChanges(a: EcosystemChange,b: EcosystemChange) {
  return a.counter-b.counter || (a.replicaId<b.replicaId?-1:a.replicaId>b.replicaId?1:0) || (a.id<b.id?-1:a.id>b.id?1:0)
}
export function mergeChanges(state: EcosystemState, changes: unknown[]): EcosystemState {
  // Validate the whole batch before replacing any state. Retain tombstones.
  const validated=changes.map(validateChange), result={...state}
  const identities=new Map<string,string>()
  for(const change of [...Object.values(state),...validated]){
    const signature=JSON.stringify({entity:change.entity,recordId:change.recordId,replicaId:change.replicaId,counter:change.counter,deleted:change.deleted,value:change.value})
    if(identities.has(change.id)&&identities.get(change.id)!==signature)throw new Error('Conflicting reuse of change ID')
    identities.set(change.id,signature)
  }
  for(const change of validated){const key=changeKey(change),existing=result[key];if(!existing||compareChanges(existing,change)<0)result[key]=change}
  return result
}
export function nextCounter(state: EcosystemState, localCounter=0) {
  const next=Object.values(state).reduce((clock,c)=>Math.max(clock,c.counter),Math.max(localCounter,0))+1
  if(!Number.isSafeInteger(next))throw new Error('Replica clock exhausted')
  return next
}
