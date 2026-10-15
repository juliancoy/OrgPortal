import {readFile,writeFile} from 'node:fs/promises'
import {mergeNetworkHistory,appendNonprofitEvidence} from '../src/features/ecosystem/network-history.js'
const read=name=>readFile(new URL(`../public/ecosystem-data/${name}.json`,import.meta.url),'utf8').then(JSON.parse)
const [base,history,nonprofit]=await Promise.all(['ecosystem-portal','ecosystem-relationships','ecosystem-nonprofits'].map(read))
const data=mergeNetworkHistory(base,appendNonprofitEvidence(history,nonprofit))
await writeFile(new URL('../public/ecosystem-data/ecosystem-organizations.json',import.meta.url),JSON.stringify({updatedAt:new Date().toISOString(),organizations:data.organizations.map(({id,name,category})=>({id,name,category}))})+'\n')
