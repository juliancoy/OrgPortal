import {expect,it} from 'vitest'
import {organizationYear} from './organizationYear'
it('defaults fresh or invalid year selections to 2025 and accepts supported filter forms',()=>{
 for(const value of [null,'','bogus','2025-01-01','0'])expect(organizationYear(value)).toBe('2025')
 for(const value of ['2024','2025','2027','all','unassigned'])expect(organizationYear(value)).toBe(value)
})
