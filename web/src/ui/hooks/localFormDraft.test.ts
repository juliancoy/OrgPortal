import { describe, expect, it } from 'vitest'
import { FORM_DRAFT_TTL, formDraftKey, readFormDraft, writeFormDraft } from './localFormDraft'
function storage() {
  const values = new Map<string,string>()
  return { getItem: (key:string) => values.get(key) ?? null, setItem:(key:string,value:string)=>{values.set(key,value)}, removeItem:(key:string)=>{values.delete(key)} }
}
describe('account and resource scoped form drafts', () => {
  const initial = { title:'', summary:'', confirmed:false }
  it('round-trips fields without crossing accounts or events and verifies the actual write', () => {
    const store=storage(),key=formDraftKey('account-one','event:one')!
    const value={title:'Demo',summary:'Local response',confirmed:true}
    expect(writeFormDraft(store,key,value,100)).toBe(true)
    expect(readFormDraft(store,key,initial,101)).toEqual(value)
    expect(readFormDraft(store,formDraftKey('account-two','event:one')!,initial,101)).toEqual(initial)
    expect(readFormDraft(store,formDraftKey('account-one','event:two')!,initial,101)).toEqual(initial)
    expect(formDraftKey(null,'event:one')).toBeNull()
  })
  it('expires drafts and ignores malformed records, unknown fields and wrong field types', () => {
    const store=storage(),key='draft'
    store.setItem(key,JSON.stringify({version:1,savedAt:100,value:{title:'Demo',summary:42,confirmed:true,token:'never restore'}}))
    expect(readFormDraft(store,key,initial,101)).toEqual({title:'Demo',summary:'',confirmed:true})
    expect(readFormDraft(store,key,initial,100+FORM_DRAFT_TTL)).toEqual(initial)
    expect(store.getItem(key)).toBeNull()
    store.setItem(key,'broken')
    expect(readFormDraft(store,key,initial)).toEqual(initial)
  })
  it('does not claim success when storage is blocked or a write fails to stick', () => {
    const blocked={getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('quota')},removeItem:()=>{}}
    expect(readFormDraft(blocked,'draft',initial)).toEqual(initial)
    expect(writeFormDraft(blocked,'draft',initial)).toBe(false)
    expect(writeFormDraft({getItem:()=>null,setItem:()=>{}},'draft',initial)).toBe(false)
  })
})
