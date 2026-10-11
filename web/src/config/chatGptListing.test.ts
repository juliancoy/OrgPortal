import { describe, it, expect } from 'vitest'
import { publicChatGptListingUrl } from './chatGptListing'
describe('published ChatGPT listing', () => {
  it('keeps unpublished and unsafe destinations unavailable', () => {
    for (const url of [undefined, '', 'https://chatgpt.com/plugins', 'https://evil.example/plugins/orgportal', 'javascript:alert(1)', 'https://chatgpt.com.evil.example/plugins/orgportal', 'https://user:secret@chatgpt.com/plugins/orgportal']) expect(publicChatGptListingUrl(url)).toBeNull()
  })
  it('accepts a configured listing without inventing one', () => {
    expect(publicChatGptListingUrl('https://chatgpt.com/plugins/example-id')).toBe('https://chatgpt.com/plugins/example-id')
  })
})
