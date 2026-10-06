import { readFile, writeFile } from 'node:fs/promises'
import { mergeNetworkHistory } from '../src/features/ecosystem/network-history.js'
import { loadPortalEvidence, graphRelationships } from '../src/features/ecosystem/portal-ecosystem.js'
const data=JSON.parse(await readFile(new URL('../public/ecosystem-data/ecosystem.json',import.meta.url)))
await import('./build-network-history.mjs')
const history=JSON.parse(await readFile(new URL('../public/ecosystem-data/ecosystem-history.json',import.meta.url)))
const updated=mergeNetworkHistory(await loadPortalEvidence(data,fetch,'https://codecollective.us/api/org/api/network'),history)
const {events,...snapshot}=updated
await writeFile(new URL('../public/ecosystem-data/ecosystem-portal.json',import.meta.url),JSON.stringify(snapshot,null,2)+'\n')
console.log(JSON.stringify({organizations:updated.organizations.length,relationships:updated.relationships.length,moneyLinks:graphRelationships(updated,{moneyOnly:true}).length,refreshedAt:updated.portalUpdatedAt}))
