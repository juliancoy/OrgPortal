import { describe, expect, it } from 'vitest'
import { urlBase64ToBytes } from './webPush'

describe('Web Push application server keys', () => {
  it('decodes URL-safe base64 without padding', () => {
    expect(Array.from(urlBase64ToBytes('AQID-_8'))).toEqual([1, 2, 3, 251, 255])
  })
})
