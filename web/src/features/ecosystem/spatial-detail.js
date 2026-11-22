import {TRANSACTION_EDGE_SEGMENTS} from './transaction-edge-path.js'

export const SPHERE_DETAIL=[[32,20],[16,10],[8,6],[6,4]]
// Hysteresis avoids rebuilding geometry when a sphere straddles a pixel boundary.
export function sphereDetailLevel(radius,current=3){
 const thresholds=[32,12,4]
 let level=current
 while(level>0&&radius>thresholds[level-1]*1.2)level--
 while(level<3&&radius<thresholds[level]*.8)level++
 return level
}
export function edgeSegmentCount(edge,adaptive=false){
 return adaptive&&!edge.curveOffset?1:TRANSACTION_EDGE_SEGMENTS
}
