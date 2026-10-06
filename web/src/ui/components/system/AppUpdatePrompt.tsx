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
    <div className={update.mandatory ? 'app-update-backdrop' : 'app-update-banner'} role="presentation">
      <section className="app-update-modal" role={update.mandatory ? 'dialog' : 'status'} aria-modal={update.mandatory ? true : undefined} aria-labelledby="app-update-title">
        <h2 id="app-update-title">{update.mandatory ? 'Update required' : 'A new version is available'}</h2>
        <p className="app-update-summary">
          {update.target === 'web'
            ? 'Reload when you’re ready. Save any changes first.'
            : 'Download the latest app to get the newest improvements.'}
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

