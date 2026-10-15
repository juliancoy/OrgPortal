import {describe,it,expect} from 'vitest'
import {ecosystemOverview} from './ecosystemOverview'
describe('ecosystem overview accounting',()=>{
 it('counts each award once, preserves signed obligations and separates unknown recipients',()=>{
  const award={id:'one',awardKey:'gov:one',source:'a',target:'redacted',kind:'transfer',amount:100.01,currency:'USD',financialMeasure:'cumulative_obligations',recipientIdentity:'unidentified'}
  const data={organizations:[{id:'a',name:'Agency'},{id:'redacted',name:'Redacted',portalSlug:'redacted'},{id:'a',name:'Agency'}],relationships:[award,{...award,id:'copy'}, {...award,id:'two',awardKey:'gov:two',amount:-20}, {id:'grant',source:'a',target:'b',kind:'transfer',amount:10,currency:'USD',financingId:'finance'},{id:'terms',kind:'terms',amount:100000,currency:'USD'},{id:'void',kind:'transfer',amount:999,currency:'USD',status:'voided'},{id:'unknown',kind:'transfer',amount:null}],financing:[{id:'finance',kind:'transfer',amount:10,currency:'USD'}],events:[{id:'event'},{id:'event'}]}
  const s=ecosystemOverview(data)
  expect(s.trackedUsd).toBe(90.01);expect(s.governmentUsd).toBe(80.01);expect(s.otherUsd).toBe(10)
  expect(s.redactedAwards).toBe(2);expect(s.redactedUsd).toBe(80.01);expect(s.negativeUsd).toBe(-20)
  expect(s.organizations).toBe(2);expect(s.identifiedOrganizations).toBe(1);expect(s.placeholders).toBe(1);expect(s.events).toBe(1)
  expect(s.undisclosedOrOtherCurrency).toBe(1)
 })
 it('does not collapse different award IDs with identical values or sum other currencies',()=>{
  const r={source:'a',target:'b',kind:'transfer',amount:5,currency:'USD'}
  const s=ecosystemOverview({organizations:[],relationships:[{...r,id:'one',awardKey:'one'},{...r,id:'two',awardKey:'two'},{...r,id:'eur',currency:'EUR'}],financing:[]})
  expect(s.trackedUsd).toBe(10);expect(s.disclosedUsdRecords).toBe(2);expect(s.undisclosedOrOtherCurrency).toBe(1)
 })
})

it('keeps nonprofit statements and future approvals out of grant volume',()=>{
 const data={organizations:[],financing:[],nonprofitProfiles:[{revenue:100000,assets:200000}],relationships:[{id:'paid',awardKey:'paid',kind:'transfer',amount:30,currency:'USD',financialMeasure:'reported_nonprofit_grant',recipientIdentity:'unidentified'},{id:'future',kind:'terms',amount:50,currency:'USD',financialMeasure:'future_grant_approval'}]}
 const stats=ecosystemOverview(data)
 expect(stats.trackedUsd).toBe(30);expect(stats.nonprofitUsd).toBe(30);expect(stats.futureNonprofitUsd).toBe(50);expect(stats.redactedUsd).toBe(30)
})
