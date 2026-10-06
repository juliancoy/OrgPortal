import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { EmbeddedOrganizationChat } from './EmbeddedOrganizationChat'
it('embeds the shared organization chat without leaking parameters or credentials', () => {
  const html = renderToStaticMarkup(createElement(EmbeddedOrganizationChat, { id: 'lifetech', name: 'LifeTech', slug: 'lifetech&user=another' }))
  expect(html).toContain('<iframe')
  expect(html).toContain('title="LifeTech chat messages and composer"')
  expect(html).toContain('org=lifetech%26user%3Danother')
  expect(html).not.toContain('token=')
})
