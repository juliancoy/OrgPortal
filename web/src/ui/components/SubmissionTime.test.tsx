import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {SubmissionTime} from './SubmissionTime'

it('renders the original instant with a timezone and machine-readable UTC time',()=>{
 const html=renderToStaticMarkup(<SubmissionTime value="2026-11-01T12:50:24-05:00"/>)
 expect(html).toContain('Submitted ')
 expect(html).toContain('dateTime="2026-11-01T17:50:24.000Z"')
 const expected=new Date('2026-11-01T17:50:24Z').toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'})
 expect(html).toContain(expected)
})
it('labels historical evidence separately from a known original submission',()=>{
 const html=renderToStaticMarkup(<SubmissionTime value="2026-11-01T17:50:24Z" source="first_recorded"/>)
 expect(html).toContain('First recorded ')
 expect(html).toContain('original submission time was not retained')
 expect(html).not.toContain('Submitted ')
})
it('does not invent a timestamp for missing or malformed data',()=>{
 for(const value of [undefined,null,'','not a date']){
  const html=renderToStaticMarkup(<SubmissionTime value={value}/>)
  expect(html).toContain('Submission time unavailable')
  expect(html).not.toContain('<time')
 }
})
