// Set only after the reviewed release has a real, published directory URL.
export function publicChatGptListingUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' || url.port || url.username || url.password) return null
    if (!/^\/(?:plugins|apps)\/[^/]+(?:\/[^/]+)*\/?$/.test(url.pathname)) return null
    return url.href
  } catch { return null }
}
