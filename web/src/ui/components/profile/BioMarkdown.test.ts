import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BioMarkdown } from './BioMarkdown'

const render = (value: string) => renderToStaticMarkup(createElement(BioMarkdown, { value }))

describe('bio Markdown', () => {
  it('renders headings, bold, italic, paragraphs and ordinary newlines', () => {
    const html = render("# Julian Coy\n\n**Organizer, LifeTech**\n\nGroups I've organized or assisted:\n*Code & Coffee*\nCode Collective")
    expect(html).toContain('<h1>Julian Coy</h1>')
    expect(html).toContain('<strong>Organizer, LifeTech</strong>')
    expect(html).toContain('<em>Code &amp; Coffee</em><br/>')
    expect(html).toContain('assisted:<br/>')
  })
  it('does not render user HTML or executable link URLs', () => {
    const html = render('<script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)\n\n[site](https://example.com)')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://example.com"')
  })
})
