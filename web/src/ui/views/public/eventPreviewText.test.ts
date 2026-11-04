import {expect,it} from 'vitest'
import {eventPreviewText} from './eventPreviewText'

it('shows readable previews for Markdown and nested imported HTML entities',()=>{
 expect(eventPreviewText('## Community gathering\n\n**Meet researchers** at [the lab](https://example.invalid).')).toBe('Community gathering Meet researchers at the lab.')
 expect(eventPreviewText('&amp;lt;p&amp;gt;Healthy habits&amp;nbsp;&amp;amp; care&amp;lt;/p&amp;gt;')).toBe('Healthy habits & care')
 expect(eventPreviewText('Center<br>100 Main Street&#160;Baltimore')).toBe('Center 100 Main Street Baltimore')
})
it('does not expose scripts, styles or dangerous markup as preview copy',()=>{
 expect(eventPreviewText('<script>alert(1)</script><style>body{display:none}</style><img src=x onerror=alert(2)>Safe text')).toBe('Safe text')
 expect(eventPreviewText(null)).toBe('')
 expect(eventPreviewText('&#x110000;Care')).toBe('Care')
})
