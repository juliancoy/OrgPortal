import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSignedS3UploadUrl } from './avatarUpload'

const originalWindow = globalThis.window

function setWindowOrigin(origin: string) {
  vi.stubGlobal('window', {
    location: {
      origin,
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalWindow !== undefined) {
    vi.stubGlobal('window', originalWindow)
  }
})

describe('resolveSignedS3UploadUrl', () => {
  it('routes relative PIDP avatar upload URLs through the PIDP proxy base', () => {
    setWindowOrigin('https://codecollective.us')

    expect(
      resolveSignedS3UploadUrl(
        '/auth/avatar/upload/avatars/user-1/photo.png?token=abc',
        '/pidp',
      ),
    ).toBe('https://codecollective.us/pidp/auth/avatar/upload/avatars/user-1/photo.png?token=abc')
  })

  it('routes relative PIDP avatar upload URLs through an absolute PIDP base', () => {
    setWindowOrigin('https://codecollective.us')

    expect(
      resolveSignedS3UploadUrl(
        '/auth/avatar/upload/avatars/user-1/photo.png',
        'https://id.codecollective.us',
      ),
    ).toBe('https://id.codecollective.us/auth/avatar/upload/avatars/user-1/photo.png')
  })

  it('preserves existing S3 proxy URL rewrites', () => {
    setWindowOrigin('https://codecollective.us')

    expect(
      resolveSignedS3UploadUrl('http://minio:9000/s3/pidp-avatars/avatars/user-1/photo.png?X-Amz-Signature=sig'),
    ).toBe('https://codecollective.us/s3/pidp-avatars/avatars/user-1/photo.png?X-Amz-Signature=sig')
  })
})
