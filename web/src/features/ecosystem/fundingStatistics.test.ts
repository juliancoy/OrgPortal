import { describe, expect, it } from 'vitest'
import { compileFunding, fundingStage, fundingSummary, fundingCsv, type FundingRound } from './fundingStatistics'
const orgs=[{id:'a',name:'Irazú Oncology',category:'company'},{id:'b',name:'Unknown Co',category:'company'},{id:'fund',name:'VC Fund',category:'funding'}]
const round=(overrides:Partial<FundingRound>={}):FundingRound=>({id:'r',recipient:'Irazu Oncology',recipientId:'a',type:'Seed',kind:'transfer',amount:2_000_000,currency:'USD',date:'2022-01',sourceUrl:'https://company.example/news',...overrides})
const compile=(rounds:FundingRound[],research:FundingRound[]=[])=>compileFunding(orgs,rounds,research,'2026-10-06')
describe('Series A funding statistics',()=>{
 it('uses explicit stages and keeps A extensions and numbered tranches in A',()=>{
  for(const type of ['Series A-2','Series A extension','Series A1'])expect(fundingStage(type)?.label).toBe('Series A')
  expect(fundingStage('Pre-Series A')?.rank).toBe(2)
  expect(fundingStage('Series B1 / B2')?.label).toBe('Series B')
  expect(fundingStage('Seed')?.rank).toBeLessThan(fundingStage('Series A')!.rank)
 })
 it('separates highest stage from largest round and never infers stage from amount',()=>{
  const c=compile([round({amount:100_000_000}),round({id:'b',type:'Series B',amount:1_000_000,date:'2024-01'})])[0]
  expect(c.stage).toBe('Series B');expect(c.largest?.type).toBe('Seed');expect(c.largest?.amount).toBe(100_000_000)
 })
 it('excludes grants, program terms, targets, future rounds and fund vehicles',()=>{
  const data=compile([round({type:'Series A grant'}),round({kind:'terms',type:'Series A'}),round({type:'Series A target'}),round({date:'2027-01'}),round({recipientId:'fund',recipient:'VC Fund',type:'Series A'})])
  expect(fundingSummary(data)).toMatchObject({total:2,known:0,unknown:2})
 })
 it('collapses duplicate evidence and successive closing reports of the same round',()=>{
  const data=compile([round(),round({id:'copy'})],[round({id:'old',type:'Series A',amount:28_000_000,date:'2024-01',roundKey:'same-a'}),round({id:'new',type:'Series A',amount:44_000_000,date:'2025-01',roundKey:'same-a'})])
  expect(data[0].rounds).toHaveLength(2);expect(data[0].seriesA?.amount).toBe(44_000_000)
  expect(fundingSummary(data).seriesAMedian).toBe(44_000_000)
 })
 it('counts undisclosed and foreign-currency stages while omitting their USD amounts',()=>{
  const data=compile([round({type:'Series A',amount:null}),round({type:'Series B',currency:'EUR',amount:100_000_000})])
  expect(data[0].stage).toBe('Series B');expect(data[0].largest).toBeNull();expect(fundingSummary(data).seriesAMedian).toBeNull()
 })
 it('keeps unknown distinct from seed-only and does not invent missing transitions',()=>{
  const data=compile([round()]);expect(fundingSummary(data)).toMatchObject({seedOnly:1,unknown:1,transitionCount:0,transitionMedian:null})
  const transition=compile([round(),round({id:'a',type:'Series A',date:'2023-05'})]);expect(transition[0].seedToAMonths).toBe(16)
  expect(compile([round({date:'2022'}),round({id:'a',type:'Series A',date:'2023-05'})])[0].seedToAMonths).toBeNull()
 })
 it('retains an unstaged closed financing amount without inventing its stage',()=>{
  const data=compile([round({type:'Financing round (stage undisclosed)',amount:40_000_000})]);expect(data[0].stage).toBe('Unknown');expect(data[0].largest?.amount).toBe(40_000_000);expect(fundingSummary(data).known).toBe(0)
 })
 it('normalizes company aliases and exports source-linked rows safely',()=>{
  const data=compile([round({recipient:'Irazu Oncology LLC'})]);expect(data).toHaveLength(2)
  data[0].name='=MALICIOUS()';expect(fundingCsv(data)).toContain('"\'=MALICIOUS()"');expect(fundingCsv(data)).toContain('https://company.example/news')
 })
})
