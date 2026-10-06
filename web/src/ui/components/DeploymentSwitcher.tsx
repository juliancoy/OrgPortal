import { useEffect, useState } from 'react'
import { isNativeCapacitorRuntime } from '../../infrastructure/platform/runtimePlatform'
import { getDeploymentStatus, selectDeployment, type DeploymentMode, type DeploymentStatus } from '../../infrastructure/platform/deployment'

export function DeploymentSwitcher({ menu = false }: { menu?: boolean }) {
  const [status, setStatus] = useState<DeploymentStatus | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (isNativeCapacitorRuntime()) return
    let active = true
    void getDeploymentStatus().then(value => { if (active) setStatus(value) })
    return () => { active = false }
  }, [])
  if (!status?.available) return null
  async function choose(mode: DeploymentMode) {
    if (pending || mode === status?.mode) return
    setPending(true)
    setError('')
    try { await selectDeployment(mode) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not switch app versions.'); setPending(false) }
  }
  return <div className="portal-deployment-switcher" role={menu ? 'group' : 'radiogroup'} aria-label="App version" aria-busy={pending}>
    <span className="portal-deployment-label">App version</span>
    {([['production', 'Deployed app'], ['development', 'Development preview']] as const).map(([mode, label]) =>
      <button key={mode} type="button" className="portal-user-menu-item" role={menu ? 'menuitemradio' : 'radio'} aria-checked={status.mode === mode} disabled={pending} onClick={() => { void choose(mode) }}>
        <span aria-hidden="true">{status.mode === mode ? '●' : '○'}</span> {label}
      </button>)}
    {error && <p role="alert" className="portal-deployment-error">{error}</p>}
  </div>
}
