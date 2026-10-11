import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {performance} from 'node:perf_hooks'
import {layoutNetwork} from '../src/features/ecosystem/ecosystem-physics.js'
import {graphRelationships,financialNodeAmounts,financialNodeRadius} from '../src/features/ecosystem/portal-ecosystem.js'
const data=JSON.parse(readFileSync(new URL('../public/ecosystem-data/ecosystem-portal.json',import.meta.url)))
const amounts=financialNodeAmounts(data),edges=graphRelationships(data)
function measure(layout){
 const runs=[]
 for(let i=0;i<7;i++){
  const nodes=data.organizations.map(n=>({...n,financialAmount:amounts.get(n.id)}))
  const sim=layout(nodes,edges.map(e=>({...e})),n=>financialNodeRadius(n.financialAmount),()=>({x:0,y:0}),{live:true})
  const start=performance.now();sim.tick(30);const perTick=(performance.now()-start)/30
  if(i>=2)runs.push(perTick)
 }
 return runs.sort((a,b)=>a-b)[2]
}
const result={nodes:data.organizations.length,edges:edges.length,currentMedianTickMs:measure(layoutNetwork)}
if(process.argv[2]){
 const previous=await import(pathToFileURL(process.argv[2]).href)
 result.baselineMedianTickMs=measure(previous.layoutNetwork)
 result.tickCostReductionPercent=100*(1-result.currentMedianTickMs/result.baselineMedianTickMs)
}
console.log(JSON.stringify(result,null,2))
