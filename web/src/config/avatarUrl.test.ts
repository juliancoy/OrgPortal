import { expect, it } from 'vitest'
import { resolveAvatarUrl } from './avatarUrl'
import { pidpUrl } from './pidp'

it('moves legacy avatar links to the current identity mount while preserving the object key', () => {
  for (const host of ['id.codecollective.us', 'id.orgportal.cc']) {
    expect(resolveAvatarUrl(`https://${host}/avatars/user-123/photo.jpg?v=2`)).toBe(pidpUrl('/avatars/user-123/photo.jpg?v=2'))
  }
})

it('preserves external photos, signed uploads, development hosts and other identity paths', () => {
  for (const url of ['', '/pidp/avatars/user/photo.jpg', 'data:image/png;base64,abc',
    'https://images.example/photo.jpg', 'https://id.codecollective.us/auth/avatar/upload/key?signature=abc',
    'https://dev.id.codecollective.us/avatars/user/photo.jpg',
    'https://id.codecollective.us.evil.example/avatars/user/photo.jpg']) expect(resolveAvatarUrl(url)).toBe(url)
})
