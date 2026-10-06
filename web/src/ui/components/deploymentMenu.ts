import { getDeploymentStatus, selectDeployment } from '../../infrastructure/platform/deployment'

// The static branded websites use the same selection API as the React shell.
export async function createDeploymentMenu(): Promise<HTMLElement | null> {
  const status = await getDeploymentStatus()
  if (!status?.available) return null
  const group = document.createElement('div')
  group.className = 'portal-deployment-switcher'
  group.setAttribute('role', 'radiogroup')
  group.setAttribute('aria-label', 'App version')
  const label = document.createElement('span')
  label.className = 'portal-deployment-label'
  label.textContent = 'App version'
  group.append(label)
  const buttons: HTMLButtonElement[] = []
  const error = document.createElement('p')
  error.className = 'portal-deployment-error'
  error.setAttribute('role', 'alert')
  error.hidden = true
  for (const [mode, text] of [['production', 'Deployed app'], ['development', 'Development preview']] as const) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'radio')
    button.setAttribute('aria-checked', String(status.mode === mode))
    const marker = document.createElement('span')
    marker.setAttribute('aria-hidden', 'true')
    marker.textContent = status.mode === mode ? '● ' : '○ '
    button.append(marker, document.createTextNode(text))
    button.addEventListener('click', async () => {
      if (status.mode === mode) return
      buttons.forEach(item => { item.disabled = true })
      error.hidden = true
      try { await selectDeployment(mode) }
      catch (reason) {
        error.textContent = reason instanceof Error ? reason.message : 'Could not switch app versions.'
        error.hidden = false
        buttons.forEach(item => { item.disabled = false })
      }
    })
    buttons.push(button)
    group.append(button)
  }
  group.append(error)
  return group
}
