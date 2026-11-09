import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NametagPrintModel } from './NametagPrintModel'

it('defaults to the recalibrated border and permits hundredth-millimeter adjustments', () => {
  const html = renderToStaticMarkup(<NametagPrintModel onPrintAdjusted={() => {}} />)
  expect(html).toContain('value="7.14"')
  expect(html).toContain('step="0.01"')
  expect(html).toContain('85.94%')
  expect(html).toContain('116.35%')
  expect(html).not.toContain('disabled=""')
})
