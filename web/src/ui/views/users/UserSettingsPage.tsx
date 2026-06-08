import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { applyThemeMode, readThemeMode, type ThemeMode } from '../../../config/theme'

export function UserSettingsPage() {
  const { role, user } = useAuth()
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode())
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Org Portal • Settings'
  }, [])

  function saveTheme(nextMode: ThemeMode) {
    setThemeMode(nextMode)
    applyThemeMode(nextMode)
    setStatus(`Theme set to ${nextMode}.`)
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
            onChange={(event) => saveTheme(event.target.value as ThemeMode)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        {status ? <p role="status" className="portal-muted">{status}</p> : null}
      </section>

      <section className="portal-card user-settings-section">
        <div>
          <h2>Identity</h2>
          <p className="portal-muted">Reference details for your signed-in account.</p>
        </div>
        <dl className="user-settings-list">
          <div>
            <dt>Name</dt>
            <dd>{user?.displayName || 'Unknown user'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>User UUID</dt>
            <dd><code>{user?.id || 'Unavailable'}</code></dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
