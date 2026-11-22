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
 expect(render({currencies:[],missingAmounts:0})).toContain('No recorded transfers')
 expect(render({currencies:[{currency:'USD',received:0,disbursed:0}],missingAmounts:0})).toContain('0.00')
})

it('map bubbles preserve signed amounts, currencies and the period without treating missing values as zero',()=>{
 const render=(totals?:Parameters<typeof OrganizationFinancialBubbles>[0]['totals'],fy='2025')=>renderToStaticMarkup(createElement(OrganizationFinancialBubbles,{totals,fy}))
 const html=render({currencies:[{currency:'USD',received:1234567.89,disbursed:-20.12},{currency:'EUR',received:100,disbursed:0}],missingAmounts:2})
 for(const text of ['Total received','Total disbursed','1,234,567.89','-USD','20.12','EUR','USD','FY2025','2 records without usable amounts excluded'])expect(html).toContain(text)
 expect(render()).toContain('Unavailable')
 expect(render({currencies:[],missingAmounts:1})).toContain('Amount unavailable')
 expect(render({currencies:[],missingAmounts:0},'unassigned')).toContain('No recorded transfers')
 expect(render(undefined,'unassigned')).toContain('Year unavailable')
 expect(render(undefined,'all')).toContain('All years')
})
