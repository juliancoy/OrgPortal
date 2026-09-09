import { expect, test } from 'vitest'
import { timebankListingPath, timebankMessagePath, timebankNoticePath } from './links'

test('timebank messaging links identify the member and listing without sending content', () => {
  const path = timebankMessagePath('user/1', 'A & B', 'listing-1')
  const url = new URL(path, 'https://example.test')
  expect(url.pathname).toBe('/chat')
  expect(url.searchParams.get('start')).toBe('dm')
  expect(url.searchParams.get('userId')).toBe('user/1')
  expect(url.searchParams.get('name')).toBe('A & B')
  expect(url.searchParams.get('timebankListing')).toBe('listing-1')
  expect(timebankListingPath('a&b')).toBe('/timebanking?listing=a%26b')
})

test('notification routing rejects external or malformed destinations', () => {
  for (const path of ['https://evil.test', '//evil.test', '/timebanking?x=1\n', '/timebanking?\\evil']) {
    expect(timebankNoticePath(path)).toBe('/timebanking?tab=notifications')
  }
  expect(timebankNoticePath('/timebanking?tab=activity&exchange=abc')).toBe('/timebanking?tab=activity&exchange=abc')
})
