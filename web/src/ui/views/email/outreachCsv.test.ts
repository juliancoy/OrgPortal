import {describe,it,expect} from 'vitest'
import {parseOutreachCsv} from './outreachCsv'
describe('outreach source CSV',()=>{
 it('preserves quoted organization names and source timestamps without recording subscription consent',()=>{const rows=parseOutreachCsv('\uFEFFemail,organization,email_source_url,source_checked_at\r\nInfo@Example.org,"Research, Inc.",https://example.org/contact,2026-10-18\r\n');expect(rows).toEqual([{email:'info@example.org',name:'Research, Inc.',source_url:'https://example.org/contact',source_checked_at:'2026-10-18',approved:false,review_reason:''}])})
 it('rejects malformed and oversized imports',()=>{expect(()=>parseOutreachCsv('organization\nHello')).toThrow('email column');expect(()=>parseOutreachCsv('email\n"broken')).toThrow('unclosed');expect(()=>parseOutreachCsv('email\n'+Array(501).fill('a@example.org').join('\n'))).toThrow('500')})
})
