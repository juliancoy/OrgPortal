import { describe, expect, it } from 'vitest'
import { formatVideoParticipantName } from './MatrixVideoCall'

describe('video participant labels', () => {
  it('turns a Matrix user id into a readable fallback name', () => {
    expect(formatVideoParticipantName('@julian_cov:matrix.org')).toBe('Julian Cov')
  })
})
