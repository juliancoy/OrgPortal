export function organizationChatPath(slug: string) {
  return `/chat?start=org&org=${encodeURIComponent(slug)}`
}

export function organizationChatSlug(params: URLSearchParams) {
  return ['org', 'group'].includes(params.get('start') || '') ? params.get('org')?.trim() || null : null
}

export function conversationChatPath(id: string) {
  return `/chat/${encodeURIComponent(id)}`
}
