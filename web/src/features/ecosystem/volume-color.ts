// Black-body-style sequential ramp. Log scaling keeps smaller recorded volumes
// distinguishable beside government-wide totals. Missing is not zero.
export const volumeColorStops=['#180909','#a51c0b','#ef6517','#ffd75a','#ffffff']
export const undisclosedVolumeColor=0x77878c
export function volumeColor(amount:number|null|undefined,maximum:number):number{
 if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0)return undisclosedVolumeColor
 const reference=Number.isFinite(maximum)&&maximum>0?maximum:1
 const t=Math.min(1,Math.log1p(amount)/Math.log1p(reference))*(volumeColorStops.length-1)
 const i=Math.min(volumeColorStops.length-2,Math.floor(t)),fraction=t-i
 const a=parseInt(volumeColorStops[i].slice(1),16),b=parseInt(volumeColorStops[i+1].slice(1),16)
 let color=0
 for(const shift of [16,8,0])color|=Math.round(((a>>shift)&255)*(1-fraction)+((b>>shift)&255)*fraction)<<shift
 return color
}
const dollars=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})
export function volumeLabel(amount:number|null|undefined):string{
 return typeof amount==='number'&&Number.isFinite(amount)&&amount>=0?`${dollars.format(amount)} recorded USD volume`:'USD volume undisclosed'
}
