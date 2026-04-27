import { describe, expect, it } from 'vitest'
import { toUserFacingErrorMessage } from './userFacingError'

describe('toUserFacingErrorMessage', () => {
  it('unwraps fastapi detail text', () => {
    const error = new Error('{"detail":"Organization not found"}')
    expect(toUserFacingErrorMessage(error, 'fallback')).toBe('Organization not found')
  })

  it('formats matrix rate-limit payload from wrapped detail json', () => {
    const error = new Error('{"detail":"{\\"errcode\\":\\"M_LIMIT_EXCEEDED\\",\\"error\\":\\"Too Many Requests\\",\\"retry_after_ms\\":73209}"}')
    expect(toUserFacingErrorMessage(error, 'fallback')).toBe('Chat is busy right now. Please retry in about 74s.')
  })
})
