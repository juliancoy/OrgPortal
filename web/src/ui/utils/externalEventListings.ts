type Listing = { url: string; title?: string | null; description?: string | null; image_url?: string | null }

export function externalEventListings(event: { source_url?: string | null; links?: Listing[] }, origin: string): Listing[] {
  const candidates = [...(event.links || [])]
  if (event.source_url) {
    const existing = candidates.find(link => link.url === event.source_url)
    if (existing) candidates.splice(candidates.indexOf(existing), 1)
    candidates.unshift(existing || { url: event.source_url })
  }
  const seen = new Set<string>()
  return candidates.filter(link => {
    try {
      const url = new URL(link.url)
      if (!['https:', 'http:'].includes(url.protocol) || url.origin === origin || seen.has(url.href)) return false
      seen.add(url.href)
      return true
    } catch { return false }
  })
}
