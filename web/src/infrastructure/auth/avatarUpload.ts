export function resolveSignedS3UploadUrl(uploadUrl: string): string {
  if (!uploadUrl) return uploadUrl
  if (typeof window === 'undefined') return uploadUrl

  try {
    const parsed = new URL(uploadUrl, window.location.origin)
    const path = parsed.pathname
    const query = parsed.search || ''

    if (path.startsWith('/s3/')) {
      return `${window.location.origin}${path}${query}`
    }

    const nestedS3 = path.indexOf('/s3/')
    if (nestedS3 >= 0) {
      return `${window.location.origin}${path.slice(nestedS3)}${query}`
    }

    return uploadUrl
  } catch {
    return uploadUrl
  }
}

