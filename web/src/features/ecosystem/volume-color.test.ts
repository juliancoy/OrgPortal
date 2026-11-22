import {expect,it} from 'vitest'
import {volumeColor,volumeColorStops,undisclosedVolumeColor,volumeLabel} from './volume-color'
it('separates undisclosed values from zero and caps the high end',()=>{
 for(const value of [null,undefined,NaN,Infinity,-1])expect(volumeColor(value,1e9)).toBe(undisclosedVolumeColor)
 expect(volumeColor(0,1e9)).toBe(parseInt(volumeColorStops[0].slice(1),16))
 expect(volumeColor(1e9,1e9)).toBe(0xffffff)
 expect(volumeColor(1e12,1e9)).toBe(0xffffff)
 expect(volumeLabel(undefined)).toBe('USD volume undisclosed')
 expect(volumeLabel(0)).toBe('$0 recorded USD volume')
})
it('spreads orders of magnitude across a monotonic black-body ramp',()=>{
 const maximum=1e12,colors=[0,1e2,1e4,1e6,1e8,1e10,1e12].map(n=>volumeColor(n,maximum))
 expect(new Set(colors).size).toBe(colors.length)
 const brightness=(c:number)=>.2126*(c>>16)+.7152*((c>>8)&255)+.0722*(c&255)
 for(let i=1;i<colors.length;i++)expect(brightness(colors[i])).toBeGreaterThan(brightness(colors[i-1]))
 expect(volumeColor(Math.expm1(Math.log1p(maximum)/2),maximum)).toBe(parseInt(volumeColorStops[2].slice(1),16))
})
