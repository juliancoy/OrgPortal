import type { AvailableUpdate } from '../../../infrastructure/platform/updateManifest'

type AppUpdatePromptProps = {
  update: AvailableUpdate
  checking: boolean
  onUpdate: () => void
  onDismiss: () => void
}

export function AppUpdatePrompt(props: AppUpdatePromptProps) {
  const { update, checking, onUpdate, onDismiss } = props
  const canDismiss = !update.mandatory
  const notes = update.notes.trim()

  return (
    <div className="app-update-backdrop" role="presentation">
      <section className="app-update-modal" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
        <h2 id="app-update-title">Update available</h2>
        <p className="app-update-summary">
          Current build: <strong>{update.current.versionName}</strong> ({update.current.buildNumber})<br />
          Latest build: <strong>{update.latestVersionName}</strong> ({update.latestBuildNumber})
        </p>
        {notes ? <p className="app-update-notes">{notes}</p> : null}
        <div className="app-update-actions">
          <button type="button" className="btn-primary" onClick={onUpdate} disabled={checking}>
            {checking ? 'Checking...' : update.actionLabel}
          </button>
          {canDismiss ? (
            <button type="button" className="btn-secondary" onClick={onDismiss} disabled={checking}>
              Later
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}

