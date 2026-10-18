import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {describe,it,expect} from 'vitest'
import {EmailCampaignStats} from './EmailCampaignStats'
describe('campaign engagement charts',()=>{
 it('uses independent denominators and accessible counts for overlapping outcomes',()=>{
  const html=renderToStaticMarkup(createElement(EmailCampaignStats,{stats:{sent:12,tracked:10,opened:8,clicked:4,unsubscribed:1}}))
  expect((html.match(/role="img"/g)||[])).toHaveLength(3)
  expect(html).toContain('8 of 10, 80.0 percent')
  expect(html).toContain('4 of 10, 40.0 percent')
  expect(html).toContain('1 of 10, 10.0 percent')
  expect(html).toContain('2 emails have no current tracking data')
 })
 it('shows unavailable rather than false zero rates when no emails were tracked',()=>{
  const html=renderToStaticMarkup(createElement(EmailCampaignStats,{stats:{sent:3,tracked:0,opened:0,clicked:0,unsubscribed:0}}))
  expect(html).toContain('No tracking data yet')
  expect(html).not.toContain('role="img"')
  expect(html).not.toContain('NaN')
 })
})
