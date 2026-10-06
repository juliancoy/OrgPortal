export type DeploymentMode = 'production' | 'development'
export type DeploymentStatus = { mode: DeploymentMode; available: boolean }
const endpoint = '/__portal/deployment'

export async function getDeploymentStatus(): Promise<DeploymentStatus | null> {
  try {
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) return null
    const status: unknown = await response.json()
    if (!status || typeof status !== 'object' || !('mode' in status) || !('available' in status)) return null
    if (!['production', 'development'].includes(String(status.mode)) || typeof status.available !== 'boolean') return null
    return status as DeploymentStatus
  } catch { return null }
}

export async function selectDeployment(mode: DeploymentMode): Promise<void> {
  const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) })
  if (!response.ok) throw new Error('Could not switch app versions. Please try again.')
  window.location.reload()
}
