/** Explicit anonymous consent; subscriptions never depend on a signed-in account. */
export async function subscribeToNewsletter(organizationId: string, email: string) {
  const response = await fetch(`/api/org/api/email/newsletter/${encodeURIComponent(organizationId)}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'omit',
    body: JSON.stringify({email, consent: true}), signal: AbortSignal.timeout(15000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.detail || 'Signup is temporarily unavailable. Please try again.')
  if (typeof result.message !== 'string') throw new Error('Unable to confirm signup. Please try again.')
  return result.message as string
}
