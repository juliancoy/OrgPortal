import {expect,it} from 'vitest'
import {performanceRows,recipientExposure,compareAttainment,type PerformanceData} from './performance'
it('never ranks unidentified or future reviews and preserves net exposure',()=>{
 const data={records:[{awardKey:'a',recipientId:'o',recipientName:'Org',identified:true,amount:100},{awardKey:'b',recipientId:'o',recipientName:'Org',identified:true,amount:-20},{awardKey:'c',recipientId:'redacted',identified:false,amount:50}],assessments:[{awardKey:'a',reviewedDate:'2030-01-01'},{awardKey:'c',reviewedDate:'2020-01-01'}]} as PerformanceData
 expect(performanceRows(data,'2026-01-01').every(r=>!r.assessment)).toBe(true)
 expect(recipientExposure(data.records)).toEqual([{id:'o',name:'Org',amount:80,awards:2}])
})

it('orders zero lower-is-better results without arbitrary percentage caps',()=>{
 const zero={attainment:null} as Parameters<typeof compareAttainment>[0],finite={attainment:2} as Parameters<typeof compareAttainment>[0]
 expect(compareAttainment(zero,finite)).toBe(1)
 expect(compareAttainment(finite,zero)).toBe(-1)
 expect(compareAttainment(zero,zero)).toBe(0)
})
