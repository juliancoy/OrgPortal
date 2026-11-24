import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {expect,it} from 'vitest'
import {OrganizationFinancialTotals,OrganizationFinancialBubbles} from './OrganizationFinancialTotals'
it('displays both totals with cents and separate currencies',()=>{
 const html=renderToStaticMarkup(createElement(OrganizationFinancialTotals,{totals:{currencies:[{currency:'USD',received:1234567.89,disbursed:-20.12},{currency:'EUR',received:100,disbursed:0}],missingAmounts:2}}))
 for(const text of ['Total received','Total disbursed','1,234,567.89','20.12','EUR','USD','2 transfer records','obligations are excluded'])expect(html).toContain(text)
})
it('distinguishes unavailable data, missing amounts, and no recorded transfers',()=>{
 const render=(totals?:Parameters<typeof OrganizationFinancialTotals>[0]['totals'])=>renderToStaticMarkup(createElement(OrganizationFinancialTotals,{totals}))
 expect(render()).toContain('Unavailable')
 expect(render({currencies:[],missingAmounts:1})).toContain('Amount unavailable')
 expect(render({currencies:[],missingAmounts:0})).toContain('No cash payments recorded')
 expect(render({currencies:[{currency:'USD',received:0,disbursed:0}],missingAmounts:0})).toContain('0.00')
})

it('map bubbles preserve signed amounts, currencies and the period without treating missing values as zero',()=>{
 const render=(totals?:Parameters<typeof OrganizationFinancialBubbles>[0]['totals'],fy='2025')=>renderToStaticMarkup(createElement(OrganizationFinancialBubbles,{totals,fy}))
 const html=render({currencies:[{currency:'USD',received:1234567.89,disbursed:-20.12},{currency:'EUR',received:100,disbursed:0}],missingAmounts:2})
 for(const text of ['Total received','Total disbursed','1,234,567.89','-USD','20.12','EUR','USD','FY2025','2 records without usable amounts excluded'])expect(html).toContain(text)
 expect(render()).toContain('Unavailable')
 expect(render({currencies:[],missingAmounts:1})).toContain('Amount unavailable')
 expect(render({currencies:[],missingAmounts:0},'unassigned')).toContain('No cash payments recorded')
 expect(render(undefined,'unassigned')).toContain('Year unavailable')
 expect(render(undefined,'all')).toContain('All years')
})

it('shows reported awards separately from cash in cards and fullscreen bubbles',()=>{
 const totals={currencies:[{currency:'USD',received:350000,disbursed:0}],missingAmounts:0,awards:[{currency:'USD',received:975600,disbursed:0}]}
 for(const component of [OrganizationFinancialTotals,OrganizationFinancialBubbles]){
  const html=renderToStaticMarkup(createElement(component,{totals,fy:'2025'}))
  expect(html).toContain('350,000.00');expect(html).toContain('975,600.00')
  expect(html).toContain('Reported awards to this group');expect(html).toContain('payment is not established by an award')
  expect(html).not.toContain('1,325,600')
 }
})

it('explains that empty cash totals do not mean there are no funding records',()=>{
 for(const component of [OrganizationFinancialTotals,OrganizationFinancialBubbles]){
  const html=renderToStaticMarkup(createElement(component,{totals:{currencies:[],missingAmounts:0}}))
  expect(html).toContain('Recorded cash payments')
  expect(html).toContain('No cash payments recorded')
  expect(html).toContain('funding commitments, such as obligations and awards')
  expect(html).toContain('annual revenue and expense observations')
  expect(html).not.toContain('No recorded transfers')
  expect(html).not.toContain('0.00')
 }
})
