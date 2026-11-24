import {it,expect} from 'vitest'
import {matchOrganizationNames,matchOrganizationEins,organizationMatchCandidate} from '../../../../shared/organizationMatching'
it('explains reversible associations without giving scores a probability meaning',()=>{
 for(const name of ['JOHNS HOPKINS UNIVERSITY','The Johns Hopkins University','JOHNS HOPKINS UNIVERSITY, THE','Board of Trustees of the Johns Hopkins University','John Hopkins University']){
  const result=matchOrganizationNames('Johns Hopkins University',name)
  expect(result.automatic,name).toBe(true);expect(result.score).toBeGreaterThanOrEqual(95)
  expect(result.version).toBe('organization-name-v1');expect(result.reasons.length).toBeGreaterThan(0)
  expect(organizationMatchCandidate('Johns Hopkins University',name)).toBe(true)
 }
})
it('uses recorded EINs to distinguish legal entities, never to collapse related corporations',()=>{
 const sameName=matchOrganizationNames('Johns Hopkins University','JOHNS HOPKINS UNIVERSITY')
 expect(matchOrganizationEins(sameName,['520595110'],['520591656']).automatic).toBe(false)
 expect(matchOrganizationEins(sameName,[],['520595110']).automatic).toBe(false)
 expect(matchOrganizationEins(sameName,['520595110','520591656'],['520595110']).automatic).toBe(false)
 const alias=matchOrganizationNames('The Johns Hopkins Hospital','Cancer center source label')
 const sameEin=matchOrganizationEins(alias,['52-0591656'],['520591656'])
 expect(sameEin.automatic).toBe(true);expect(sameEin.eins?.source).toEqual(['520591656'])
 expect(sameEin.score).toBe(alias.score) // Name similarity stays separate from identity evidence.
 expect(matchOrganizationEins(sameName,['520595110'],[]).automatic).toBe(true)
})
it('does not auto-associate campuses, hospitals, foundations, legal suffixes or generic names',()=>{
 for(const name of ['Johns Hopkins Hospital','Johns Hopkins University Applied Physics Laboratory LLC','Johns Hopkins University Foundation','Johns Hopkins University School of Nursing','Johns Hopkins University LLC'])expect(matchOrganizationNames('Johns Hopkins University',name).automatic,name).toBe(false)
 expect(matchOrganizationNames('University of Maryland Baltimore','University of Maryland Baltimore County').automatic).toBe(false)
 expect(matchOrganizationNames('University','University').automatic).toBe(false)
 expect(matchOrganizationNames('Acme Foundation','Acme Corporation').automatic).toBe(false)
})
