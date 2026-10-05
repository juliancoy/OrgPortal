import {describe,it,expect} from 'vitest'
import ledger from '../../data/tedco-company-financing.json'
import funding from '../../data/tedco-recipient-funding-status.json'
import manifest from '../../data/tedco-recipients.json'
import {equitySubtotal,type FinancingEvent,type FinancingReport} from './companyFinancing'
import {financingImportBatches} from './financingImport'
import type {FundingReport} from './tedcoFunding'
describe('financing coverage and deduplication',()=>{
 it('covers every recipient with a search and an honest incomplete audit state',()=>{expect(ledger.audit.map(r=>r.key).sort()).toEqual(manifest.recipients.map(r=>r.key).sort());expect(ledger.audit.every(r=>r.searchedAt==='2026-10-05')).toBe(true);expect(ledger.audit.filter(r=>r.status==='partial')).toHaveLength(9);expect(ledger.events.filter(e=>e.type==='equity')).toHaveLength(8);expect(ledger.events.find(e=>e.companyKey.startsWith('proscia-'))?.type).toBe('cumulative')})
 it('excludes cumulative, debt, grant, acquisition and repeat announcements from equity totals',()=>{const round=ledger.events[0] as FinancingEvent;expect(equitySubtotal([round,round,...(['cumulative','debt','grant','acquisition'] as const).map(type=>({...round,id:type,type}))])).toBe(round.amountUsd);expect(equitySubtotal([])).toBeNull()})
 it('imports every verified agency amount once and links Pixee to its whole round',async()=>{
 const batches=await financingImportBatches(manifest,funding as FundingReport,ledger as FinancingReport);expect(batches.flatMap(b=>b.recipients)).toHaveLength(578);const events=batches.flatMap(b=>b.events);expect(new Set(events.map(e=>e.id)).size).toBe(events.length)
 for(const c of funding.companies){const facts=events.filter(e=>e.companyKey===c.key&&e.type==='agency');expect(facts.length?Math.round(facts.reduce((n,e)=>n+e.amountUsd,0)*100)/100:null).toBe(c.totalUsd)}const pixee=events.find(e=>e.type==='agency'&&e.companyKey.startsWith('pixee-'))!;expect(events.find(e=>e.id===pixee.includedInEventId)?.amountUsd).toBe(15000000)
 })
})
