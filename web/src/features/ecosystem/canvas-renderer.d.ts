export type CanvasNode={id:string;x:number;y:number;renderRadius:number;category:string;opacity:number;volumeColor?:number;sphereTitle?:string}
export type CanvasEdge={id:string;source:CanvasNode;target:CanvasNode;relationship:string;directional:boolean;quantityWidth:number;opacity:number;curveOffset:number}
export type CanvasView={x:number;y:number;w:number;h:number}
export function createNetworkCanvas(canvas:HTMLCanvasElement):{
 update(nodes:CanvasNode[],edges:CanvasEdge[],visible:Set<string>,visibleEdges:Set<string>,selected:string,colors:Record<string,number>,edgeColor:(edge:CanvasEdge)=>number):void
 render(view:CanvasView):void
 resize(width:number,height:number,pixelRatio?:number):void
 dispose():void
}
