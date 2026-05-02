import { useEffect, useState, type FormEvent } from 'react'
import { Header } from '../shell/Header'
import { Footer } from '../shell/Footer'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

const ORG_API_BASE = '/api/org'

type UbiRuntimeSettings = {
  interval_seconds: number
  dena_annual: number
  dena_precision: number
  entity_types: string[]
  updated_at?: string
  updated_by?: string | null
}

type UbiSettingsFormState = {
  interval_value: string
  interval_unit: 'seconds' | 'hours' | 'days' | 'weeks'
  dena_annual: string
  dena_precision: string
  entity_types: string
}

const INTERVAL_UNIT_FACTORS = {
  seconds: 1,
  hours: 60 * 60,
  days: 60 * 60 * 24,
  weeks: 60 * 60 * 24 * 7,
} as const

const INTERVAL_UNIT_LIMITS: Record<UbiSettingsFormState['interval_unit'], { min: number; max: number; step: number }> = {
  seconds: { min: 1, max: 59, step: 1 },
  hours: { min: 1, max: 23, step: 1 },
  days: { min: 1, max: 30, step: 1 },
  weeks: { min: 1, max: 8, step: 1 },
}

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function buildForm(data: UbiRuntimeSettings): UbiSettingsFormState {
  const intervalSeconds = Number(data.interval_seconds ?? 60)
  if (intervalSeconds % INTERVAL_UNIT_FACTORS.weeks === 0) {
    return {
      interval_value: String(intervalSeconds / INTERVAL_UNIT_FACTORS.weeks),
      interval_unit: 'weeks',
      dena_annual: String(data.dena_annual ?? 1),
      dena_precision: String(data.dena_precision ?? 6),
      entity_types: Array.isArray(data.entity_types) ? data.entity_types.join(', ') : 'individual',
    }
  }
  if (intervalSeconds % INTERVAL_UNIT_FACTORS.days === 0) {
    return {
      interval_value: String(intervalSeconds / INTERVAL_UNIT_FACTORS.days),
      interval_unit: 'days',
      dena_annual: String(data.dena_annual ?? 1),
      dena_precision: String(data.dena_precision ?? 6),
      entity_types: Array.isArray(data.entity_types) ? data.entity_types.join(', ') : 'individual',
    }
  }
  if (intervalSeconds % INTERVAL_UNIT_FACTORS.hours === 0) {
    return {
      interval_value: String(intervalSeconds / INTERVAL_UNIT_FACTORS.hours),
      interval_unit: 'hours',
      dena_annual: String(data.dena_annual ?? 1),
      dena_precision: String(data.dena_precision ?? 6),
      entity_types: Array.isArray(data.entity_types) ? data.entity_types.join(', ') : 'individual',
    }
  }
  return {
    interval_value: String(intervalSeconds),
    interval_unit: 'seconds',
    dena_annual: String(data.dena_annual ?? 1),
    dena_precision: String(data.dena_precision ?? 6),
    entity_types: Array.isArray(data.entity_types) ? data.entity_types.join(', ') : 'individual',
  }
}

export function UbiSettingsPage() {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [settings, setSettings] = useState<UbiRuntimeSettings | null>(null)
  const [intervalError, setIntervalError] = useState<string | null>(null)
  const [form, setForm] = useState<UbiSettingsFormState>({
    interval_value: '60',
    interval_unit: 'seconds',
    dena_annual: '1',
    dena_precision: '6',
    entity_types: 'individual',
  })

  async function fetchWithTokenRefresh(path: string, init: RequestInit = {}): Promise<Response> {
    if (!token) {
      return new Response('Authentication required', { status: 401 })
    }
    const requestWithToken = (authToken: string) => {
      const headers = new Headers(init.headers || {})
      headers.set('Authorization', `Bearer ${authToken}`)
      return fetch(orgUrl(path), { ...init, headers })
    }
    let response = await requestWithToken(token)
    if (response.status === 401) {
      const refreshed = await refreshRuntimeTokenFromSession()
      if (refreshed) {
        response = await requestWithToken(refreshed)
      }
    }
    return response
  }

  async function loadSettings() {
    setIsLoading(true)
    setStatus(null)
    try {
      const response = await fetchWithTokenRefresh('/api/ubi/settings')
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Failed to load UBI settings (${response.status})`)
      }
      const data = (await response.json()) as UbiRuntimeSettings
      setSettings(data)
      setForm(buildForm(data))
      setStatus('UBI settings loaded.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load UBI settings.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!token) {
      setStatus('Login required.')
      return
    }
    loadSettings()
  }, [token])

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setStatus(null)
    try {
      const parsedIntervalValue = Number(form.interval_value)
      const intervalFactor = INTERVAL_UNIT_FACTORS[form.interval_unit]
      const intervalLimits = INTERVAL_UNIT_LIMITS[form.interval_unit]
      const intervalSeconds = Math.round(parsedIntervalValue * intervalFactor)
      const payload = {
        interval_seconds: intervalSeconds,
        dena_annual: Number(form.dena_annual),
        dena_precision: Number(form.dena_precision),
        entity_types: form.entity_types
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }

      if (!Number.isFinite(parsedIntervalValue) || parsedIntervalValue <= 0) {
        throw new Error('Interval must be a number greater than 0.')
      }
      if (parsedIntervalValue < intervalLimits.min || parsedIntervalValue > intervalLimits.max) {
        throw new Error(
          `For ${form.interval_unit}, value must be between ${intervalLimits.min} and ${intervalLimits.max}.`,
        )
      }
      if (!Number.isFinite(payload.interval_seconds) || payload.interval_seconds < 1) {
        throw new Error('Interval is too small after unit conversion. Increase value or use a larger unit.')
      }
      if (!Number.isFinite(payload.dena_annual) || payload.dena_annual < 0) {
        throw new Error('Annual amount must be a non-negative number.')
      }
      if (!Number.isFinite(payload.dena_precision) || payload.dena_precision < 0 || payload.dena_precision > 12) {
        throw new Error('Precision must be a number from 0 to 12.')
      }
      if (!payload.entity_types.length) {
        throw new Error('At least one entity type is required.')
      }

      const response = await fetchWithTokenRefresh('/api/ubi/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Failed to update UBI settings (${response.status})`)
      }

      const data = (await response.json()) as UbiRuntimeSettings
      setSettings(data)
      setForm(buildForm(data))
      setIntervalError(null)
      setStatus('UBI settings updated.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update UBI settings.'
      if (message.toLowerCase().includes('interval')) {
        setIntervalError(message)
      }
      setStatus(message)
    } finally {
      setIsSaving(false)
    }
  }

  const intervalLimits = INTERVAL_UNIT_LIMITS[form.interval_unit]
  const parsedIntervalValue = Number(form.interval_value)
  const intervalPreviewSeconds = Math.max(
    1,
    Math.round((Number(form.interval_value) || 0) * INTERVAL_UNIT_FACTORS[form.interval_unit]),
  )
  const intervalSummary = Number.isFinite(parsedIntervalValue) && parsedIntervalValue > 0
    ? `Runs every ${parsedIntervalValue} ${form.interval_unit.replace(/s$/, parsedIntervalValue === 1 ? '' : 's')}.`
    : 'Enter a valid interval value.'

  return (
    <div className="portal-shell">
      <Header />
      <main className="portal-main">
        <div className="portal-container">
          <section className="portal-hero">
            <div>
              <span className="portal-pill">SysAdmin</span>
              <h1>UBI Settings</h1>
              <p className="portal-muted">Manage runtime UBI accrual settings for the organization economy.</p>
              {status && <p className="portal-muted">{status}</p>}
            </div>
          </section>

          <section className="portal-section">
            <form className="portal-card portal-form" onSubmit={saveSettings}>
              <h2>Runtime configuration</h2>
              <label>
                Payout interval
                <p className="portal-muted" style={{ marginTop: 4, marginBottom: 8 }}>
                  How often UBI is distributed.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setForm({ ...form, interval_value: '1', interval_unit: 'hours' })
                      setIntervalError(null)
                    }}
                  >
                    Hourly
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setForm({ ...form, interval_value: '1', interval_unit: 'days' })
                      setIntervalError(null)
                    }}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setForm({ ...form, interval_value: '1', interval_unit: 'weeks' })
                      setIntervalError(null)
                    }}
                  >
                    Weekly
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    min={intervalLimits.min}
                    max={intervalLimits.max}
                    step={intervalLimits.step}
                    value={form.interval_value}
                    onChange={(event) => {
                      setForm({ ...form, interval_value: event.target.value })
                      setIntervalError(null)
                    }}
                    style={{ flex: 1 }}
                    aria-label="Interval value"
                  />
                  <select
                    value={form.interval_unit}
                    onChange={(event) => {
                      setForm({
                        ...form,
                        interval_unit: event.target.value as UbiSettingsFormState['interval_unit'],
                      })
                      setIntervalError(null)
                    }}
                    aria-label="Interval unit"
                  >
                    <option value="seconds">Seconds</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>
              </label>
              <p className="portal-muted" style={{ marginTop: -4, marginBottom: 4 }}>
                Allowed for {form.interval_unit}: {intervalLimits.min} to {intervalLimits.max}. {intervalSummary}
              </p>
              <p className="portal-muted" style={{ marginTop: 0 }}>
                Internal storage: {intervalPreviewSeconds} seconds.
              </p>
              {intervalError && (
                <p role="alert" style={{ color: '#9f1239', marginTop: 0, marginBottom: 8 }}>
                  {intervalError}
                </p>
              )}
              <label>
                Annual amount
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={form.dena_annual}
                  onChange={(event) => setForm({ ...form, dena_annual: event.target.value })}
                />
              </label>
              <label>
                Precision
                <input
                  type="number"
                  min="0"
                  max="12"
                  step="1"
                  value={form.dena_precision}
                  onChange={(event) => setForm({ ...form, dena_precision: event.target.value })}
                />
              </label>
              <label>
                Entity types (comma-separated)
                <input
                  value={form.entity_types}
                  onChange={(event) => setForm({ ...form, entity_types: event.target.value })}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save UBI settings'}
                </button>
                <button type="button" className="secondary" onClick={loadSettings} disabled={isLoading || isSaving}>
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              {settings && <p className="portal-muted">Updated by: {settings.updated_by ?? '—'}</p>}
              {settings && <p className="portal-muted">Updated at: {formatDateTime(settings.updated_at)}</p>}
            </form>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
