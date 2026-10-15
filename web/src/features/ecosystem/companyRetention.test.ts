import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {companyLocationBenchmark as source,companyLocationStats} from './companyRetention'
it('keeps unknown outcomes in the source-cohort denominator',()=>{
 const stats=companyLocationStats({totalCompanies:100,inMaryland:50,outsideMaryland:10,operatingInformationUnavailable:40})
 expect(stats.outsidePercent).toBe(10);expect(stats.unknownPercent).toBe(40)
})
it('does not display zero percent for an empty or unreconciled cohort',()=>{
 expect(companyLocationStats({totalCompanies:0,inMaryland:0,outsideMaryland:0,operatingInformationUnavailable:0}).outsidePercent).toBeNull()
 for(const counts of [{...source,totalCompanies:431},{...source,outsideMaryland:-1},{...source,inMaryland:326.5}])expect(()=>companyLocationStats(counts)).toThrow()
})
it('reproduces the historical source share without rounding away unknown companies',()=>{
 expect(companyLocationStats(source).outsidePercent?.toFixed(2)).toBe('9.95')
 expect(companyLocationStats(source).unknownPercent?.toFixed(2)).toBe('14.58')
 expect(source.observationYear).toBe(2018)
})
it('preserves the reviewed primary source with its recorded checksum',()=>{
 const pdf=readFileSync(new URL('../../../public'+source.archiveUrl,import.meta.url))
 expect(pdf.subarray(0,5).toString()).toBe('%PDF-')
 expect(createHash('sha256').update(pdf).digest('hex')).toBe(source.sourceSha256)
})
