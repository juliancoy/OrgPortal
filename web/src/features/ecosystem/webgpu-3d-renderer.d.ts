import type {CanvasNode,CanvasEdge} from './canvas-renderer.js'
export type CameraView={offset:number[];up:number[];referenceDistance:number;minDistance:number;maxDistance:number}
export type SpatialNode=CanvasNode&{z?:number;volumeColor?:number}
export type ProjectedNode={x:number;y:number;visible:boolean;depth:number}
export type Network3DRenderer={
 backend:string
 update(nodes:SpatialNode[],edges:CanvasEdge[],visible:Set<string>,visibleEdges:Set<string>,selected:string,colors:Record<string,number>,edgeColor:(edge:CanvasEdge)=>number):void
 render():boolean
 resize(width:number,height:number):void
 project(node:SpatialNode,target?:ProjectedNode):ProjectedNode
 adapt(milliseconds:number,minimumFPS?:number):void
 fit(nodes:SpatialNode[]):void
 focus(node:SpatialNode,immediate?:boolean):void
 stopFocus():void
 zoom(factor:number):void
 hit(event:Pick<PointerEvent,'clientX'|'clientY'|'pointerType'>):{node?:SpatialNode;edge?:CanvasEdge}
 cameraView():CameraView
 restoreCameraView(view:CameraView,node:SpatialNode):void
 cameraPosition():{x:number;y:number;z:number}
 hasSurfaceTitle(id:string):boolean
 dispose():void
}
export function createNetworkGPU3D(canvas:HTMLCanvasElement,onLost:(message:string)=>void,changed:()=>void,dimension?:string,movementSpeed?:()=>number,moveFourth?:(delta:number[])=>void,orbitSelected?:()=>boolean,options?:{forceWebGL?:boolean;adaptiveDetail?:boolean}):Promise<Network3DRenderer>
