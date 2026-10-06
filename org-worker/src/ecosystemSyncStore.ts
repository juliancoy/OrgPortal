import {mergeChanges,validateChange,type EcosystemChange} from '../../shared/ecosystemSync'
type Row={sequence:number;id:string;entity:EcosystemChange['entity'];record_id:string;replica_id:string;counter:number;deleted:number;value_json:string;pending:number}
const decode=(row:Row):EcosystemChange=>({id:row.id,entity:row.entity,recordId:row.record_id,replicaId:row.replica_id,counter:row.counter,deleted:!!row.deleted,value:JSON.parse(row.value_json)})
/** Call only after the application has authorized every change in the batch. */
export async function receiveAuthorizedChanges(db:D1Database,input:unknown[],pending=false){
 const changes=input.map(validateChange)
 mergeChanges({},changes)
 if(changes.length>100)throw Error('Sync batch exceeds 100 changes')
 await db.batch(changes.map(c=>db.prepare(`INSERT INTO ecosystem_sync_changes(id,entity,record_id,replica_id,counter,deleted,value_json,pending)
 VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json
 WHERE entity!=excluded.entity OR record_id!=excluded.record_id OR replica_id!=excluded.replica_id OR counter!=excluded.counter OR deleted!=excluded.deleted OR value_json!=excluded.value_json`)
 .bind(c.id,c.entity,c.recordId,c.replicaId,c.counter,Number(c.deleted),JSON.stringify(c.value),Number(pending))))
 return changes.map(c=>c.id)
}
export async function syncPage(db:D1Database,after=0){
 if(!Number.isSafeInteger(after)||after<0)throw Error('Invalid sync cursor')
 const result=await db.prepare('SELECT * FROM ecosystem_sync_changes WHERE sequence>? AND pending=0 ORDER BY sequence LIMIT 100').bind(after).all<Row>()
 return {changes:result.results.map(decode),cursor:result.results.at(-1)?.sequence ?? after,hasMore:result.results.length===100}
}
export async function sqliteSyncState(db:D1Database){
 const rows=await db.prepare('SELECT * FROM ecosystem_sync_changes ORDER BY sequence').all<Row>()
 return mergeChanges({},rows.results.map(decode))
}
export async function pendingSqliteChanges(db:D1Database){
 const rows=await db.prepare('SELECT * FROM ecosystem_sync_changes WHERE pending=1 ORDER BY sequence LIMIT 100').all<Row>()
 return rows.results.map(decode)
}
export async function acknowledgeSqliteChanges(db:D1Database,ids:string[]){
 if(ids.length>100)throw Error('Sync batch exceeds 100 acknowledgements')
 // Publish at a fresh feed position: readers may have passed this pending row.
 await db.batch(ids.map(id=>db.prepare('UPDATE ecosystem_sync_changes SET pending=0, sequence=(SELECT COALESCE(MAX(sequence),0)+1 FROM ecosystem_sync_changes) WHERE id=? AND pending=1').bind(id)))
}
