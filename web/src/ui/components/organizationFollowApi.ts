export async function organizationFollowState(orgId: string, token: string, method: 'GET' | 'PUT' | 'DELETE' = 'GET', signal?: AbortSignal) {
  const response = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(orgId)}/follow`, {
    method, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
  })
  if (!response.ok) throw new Error('Unable to update following. Please try again.')
  const body = await response.json() as { following?: unknown }
  if (typeof body.following !== 'boolean') throw new Error('Following is unavailable. Please try again.')
  return body.following
}
