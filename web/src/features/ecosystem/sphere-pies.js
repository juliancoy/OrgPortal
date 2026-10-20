import {Color,SRGBColorSpace} from 'three'
// Pack longitude color strips into one texture shared by all instanced spheres.
// Each wedge covers the same fraction of the sphere's surface as its 2D pie.
export function spherePieAtlas(nodes,maxTextureSize=4096){
 const count=Math.max(1,nodes.length),columns=Math.max(Math.min(8,count),Math.ceil(count/maxTextureSize))
 const samples=Math.min(512,Math.floor(maxTextureSize/columns)),width=columns*samples,height=Math.ceil(count/columns)
 if(samples<1)throw new Error('Too many sphere pies for this graphics device')
 const tint=new Color()
 const data=new Uint8Array(width*height*4).fill(255),coordinates=new Float32Array(count*3)
 nodes.forEach((node,index)=>{
  const column=index%columns,row=Math.floor(index/columns)
  coordinates.set([(column*samples+.5)/width,(row+.5)/height,(samples-1)/width],index*3)
  const slices=node.financialPie?.slices
  if(!slices?.length)return
  const palette=slices.map(slice=>tint.set(slice.color).getHex(SRGBColorSpace))
  let slice=0
  for(let sample=0;sample<samples;sample++){
   const angle=-Math.PI/2+(sample+.5)/samples*Math.PI*2
   while(slice<slices.length-1&&angle>=slices[slice].endAngle)slice++
   const color=palette[slice]
   const offset=(row*width+column*samples+sample)*4
   data[offset]=(color>>16)&255;data[offset+1]=(color>>8)&255;data[offset+2]=color&255
  }
 })
 return {data,width,height,coordinates}
}
