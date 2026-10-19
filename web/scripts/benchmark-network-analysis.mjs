import {performance} from 'node:perf_hooks'
import assert from 'node:assert/strict'
import {createNetworkAnalysis,disclosure} from '../src/features/ecosystem/network-analysis.js'
const nodes=Array.from({length:2009},(_,i)=>({id:String(i),category:String(i%12)}))
const edges=Array.from({length:2503},(_,i)=>({id:String(i),source:String(i%2009),target:String((i*13+1)%2009),kind:'transfer',currency:'USD',amount:i%5?null:i}))
const before=process.memoryUsage().heapUsed,start=performance.now(),analysis=createNetworkAnalysis(nodes,edges);analysis.communities();const indexMs=performance.now()-start
const queryStart=performance.now();for(let i=0;i<2009;i++)analysis.neighborhood(String(i),3);const allQueriesMs=performance.now()-queryStart
const cachedStart=performance.now();for(let i=0;i<2009;i++)analysis.neighborhood(String(i),3);const cachedQueriesMs=performance.now()-cachedStart
const disclosureStart=performance.now();const overview=disclosure(analysis,edges);const overviewMs=performance.now()-disclosureStart
assert.ok(indexMs<2000,'Index and communities should finish within a broad 2-second CI budget')
assert.ok(allQueriesMs<2000,'All bounded neighborhood queries should finish within 2 seconds')
console.log(JSON.stringify({nodes:nodes.length,edges:edges.length,indexMs,allQueriesMs,cachedQueriesMs,overviewMs,heapDeltaBytes:process.memoryUsage().heapUsed-before,communities:overview.clusters.size,overviewEdges:overview.edgeIds.size},null,2))
