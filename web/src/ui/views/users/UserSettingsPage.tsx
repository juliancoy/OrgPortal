import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { applyThemeMode, readThemeMode, type ThemeMode } from '../../../config/theme'
import {
  disableWebPush,
  enableWebPush,
  getWebPushState,
  type WebPushState,
} from '../../../infrastructure/platform/webPush'

export function UserSettingsPage() {
  const { role, token } = useAuth()
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode())
  const [status, setStatus] = useState<string | null>(null)
  const [pushState, setPushState] = useState<WebPushState>('disabled')
  const [pushBusy, setPushBusy] = useState(true)
  const [pushMessage, setPushMessage] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Org Portal • Settings'
  }, [])

  useEffect(() => {
    if (!token) {
      setPushBusy(false)
      return
    }
    let cancelled = false
    setPushBusy(true)
    getWebPushState(token)
      .then((nextState) => {
        if (!cancelled) setPushState(nextState)
      })
      .catch((error) => {
        if (!cancelled) {
          setPushState('unconfigured')
          setPushMessage(error instanceof Error ? error.message : 'Unable to check notification status.')
        }
      })
      .finally(() => {
        if (!cancelled) setPushBusy(false)
      })
    return () => { cancelled = true }
  }, [token])

  function saveTheme(nextMode: ThemeMode) {
    setThemeMode(nextMode)
    applyThemeMode(nextMode)
    const label = nextMode === 'system' ? 'system default' : nextMode
    setStatus(`Theme set to ${label}.`)
  }

  async function togglePushNotifications() {
    if (!token) return
    setPushBusy(true)
    setPushMessage(null)
    try {
      if (pushState === 'enabled') {
        await disableWebPush(token)
        setPushState('disabled')
        setPushMessage('Push notifications are off on this browser.')
      } else {
        await enableWebPush(token)
        setPushState('enabled')
        setPushMessage('Push notifications are on for this browser.')
      }
    } catch (error) {
      const nextState = await getWebPushState(token).catch(() => pushState)
      setPushState(nextState)
      setPushMessage(error instanceof Error ? error.message : 'Unable to update push notifications.')
    } finally {
      setPushBusy(false)
    }
  }

  if (role === 'guest') {
    return (
      <main className="portal-page">
        <section className="panel">
          <h1 style={{ marginTop: 0 }}>Settings</h1>
          <p className="muted">Sign in required.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="portal-page user-settings-page">
      <section className="portal-page-heading">
        <div>
          <p className="portal-eyebrow">Account</p>
          <h1>Settings</h1>
          <p className="portal-muted">Manage application preferences and account-level options.</p>
        </div>
        <Link className="portal-button secondary" to="/profile">
          Back to profile
        </Link>
      </section>

      <section className="portal-card user-settings-section">
        <div>
          <h2>System Appearance</h2>
          <p className="portal-muted">Choose the color mode used across the portal.</p>
        </div>
        <label className="user-settings-control">
          <span>Theme</span>
          <select
            value={themeMode}
            aria-label="Select color theme"
            onChange={(event) => saveTheme(event.target.value as ThemeMode)}
          >
            <option value="system">System default</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        {status ? <p role="status" className="portal-muted">{status}</p> : null}
      </section>

      <section className="portal-card user-settings-section">
        <div>
          <h2>Calendar Integrations</h2>
          <p className="portal-muted">Manage Google Calendar and other calendar export options from one place.</p>
        </div>
        <div className="user-settings-notification-row">
          <div>
            <strong>Calendar integrations</strong>
            <p className="portal-muted">Open your calendar integrations page to connect Google Calendar or review upcoming events.</p>
          </div>
          <Link className="portal-button primary" to="/calendar">
            Open Calendar
          </Link>
        </div>
      </section>

      <section className="portal-card user-settings-section">
        <div>
          <h2>Push Notifications</h2>
          <p className="portal-muted">Receive connection and chat alerts even when the portal is not open.</p>
        </div>
        <div className="user-settings-notification-row">
          <div>
            <strong>{pushState === 'enabled' ? 'On for this browser' : 'Off for this browser'}</strong>
            <p className="portal-muted">
              {pushState === 'unsupported' && 'This browser does not support Web Push.'}
              {pushState === 'unconfigured' && 'Push delivery is not configured on the server.'}
              {pushState === 'denied' && 'Notifications are blocked in your browser settings.'}
              {pushState === 'disabled' && 'Permission is requested only when you turn notifications on.'}
              {pushState === 'enabled' && 'You can turn alerts off here at any time.'}
            </p>
          </div>
          <button
            className={`portal-button ${pushState === 'enabled' ? 'secondary' : 'primary'}`}
            type="button"
            disabled={pushBusy || pushState === 'unsupported' || pushState === 'unconfigured' || pushState === 'denied'}
            onClick={() => void togglePushNotifications()}
          >
            {pushBusy ? 'Checking…' : pushState === 'enabled' ? 'Turn off' : 'Turn on'}
          </button>
        </div>
        {pushMessage ? <p role="status" className="portal-muted">{pushMessage}</p> : null}
      </section>
    </main>
  )
}
