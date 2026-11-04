import {writeFile} from 'node:fs/promises'
import {exportUnifiedEcosystem} from './unified-ecosystem.mjs'
const destination=process.argv[2]
if(!destination)throw Error('Provide a destination for the verified public build snapshot')
const snapshot=await exportUnifiedEcosystem()
await writeFile(destination,JSON.stringify(snapshot))
console.log('Staged verified public ecosystem snapshot '+snapshot.datasetId)
