import {expect,it} from 'vitest'
import {organizationEvidenceLabel} from './organizationEvidenceLabel'
it('labels HUD award snapshots as obligations even when the storage kind is transfer',()=>{
 expect(organizationEvidenceLabel({kind:'transfer',financialFactType:'obligation',financialMeasure:'cumulative_obligations'})).toBe('Cumulative obligations (award total)')
 expect(organizationEvidenceLabel({kind:'obligation',financialFactType:'obligation',measurement:'delta'})).toBe('Obligation transaction (funding commitment)')
 expect(organizationEvidenceLabel({kind:'transfer',financialMeasure:'cumulative_obligations'})).toBe('Cumulative obligations (award total)')
})
it('preserves the distinction between award announcements and reported payments',()=>{
 expect(organizationEvidenceLabel({kind:'transfer',description:'Infrastructure grant'})).toBe('Award / approval (payment not established)')
 expect(organizationEvidenceLabel({kind:'transfer',description:'Infrastructure grant',financialFactType:'disbursement'})).toBe('Recorded payment')
 expect(organizationEvidenceLabel({kind:'transfer'})).toBe('Reported transfer')
})
it('annual customer revenue and expenses are not described as individual payments',()=>{
 expect(organizationEvidenceLabel({kind:'revenue',financialFactType:'revenue'})).toBe('Annual revenue (not an individual payment)')
 expect(organizationEvidenceLabel({kind:'expense',financialFactType:'expense'})).toBe('Annual expense (not an individual payment)')
})
