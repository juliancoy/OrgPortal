import {it,expect} from 'vitest'
import {newInitiative,initiativeProgress,initiativeSummary,nextDeadline} from '../../../../shared/interventions'
it('handles decreasing metrics, zero measurements, no baseline and bounded progress',()=>{
 const base={...newInitiative(),baseline:60,target:30,current:45}
 expect(initiativeProgress(base)).toBe(50);expect(initiativeProgress({...base,current:0})).toBe(100)
 expect(initiativeProgress({...base,current:90})).toBe(0);expect(initiativeProgress({...base,baseline:null})).toBe(null)
 expect(initiativeProgress({...base,target:60})).toBe(null)
})
it('finds the next deadline and counts overdue open work without guessing missing dates',()=>{
 const base=newInitiative();const late={...base,decisionDate:'2026-10-01',actionDueDate:'2026-10-20'}
 expect(nextDeadline(late)).toBe('2026-10-01')
 const stats=initiativeSummary([late,{...late,status:'completed'},{...late,status:'paused'},base],'2026-10-14')
 expect(stats.overdue).toBe(1);expect(stats.total).toBe(4);expect(stats.completed).toBe(1)
})
