import { afterEach, expect, test, vi } from 'vitest'
import { readAvailabilityDraft,writeAvailabilityDraft,clearAvailabilityDraft } from './availabilityDraft'
afterEach(()=>vi.unstubAllGlobals())
test('drafts survive reload, isolate accounts and date ranges, and reject obsolete slots',()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)})
 writeAvailabilityDraft('alice','week','UTC',['slot']);expect(readAvailabilityDraft('alice','week','UTC',['slot'])).toEqual(['slot']);expect(readAvailabilityDraft('bob','week','UTC',['slot'])).toBeNull();expect(readAvailabilityDraft('alice','other','UTC',['slot'])).toBeNull();expect(readAvailabilityDraft('alice','week','UTC',['new'])).toBeNull();clearAvailabilityDraft('alice','week','UTC');expect(readAvailabilityDraft('alice','week','UTC',['slot'])).toBeNull();writeAvailabilityDraft('alice','week','UTC',[]);expect(readAvailabilityDraft('alice','week','UTC',['slot'])).toEqual([])
})
