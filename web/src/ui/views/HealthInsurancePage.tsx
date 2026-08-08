import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/AppProviders'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

const ORG_API_BASE = '/api/org'
const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['AS', 'American Samoa'], ['GU', 'Guam'],
  ['MP', 'Northern Mariana Islands'], ['PR', 'Puerto Rico'], ['VI', 'U.S. Virgin Islands'],
] as const

type CodeSystem = 'HCPCS_LEVEL_II' | 'CPT' | 'ICD10_PCS' | 'NDC'
type ClaimLineForm = { code_system: CodeSystem; code: string; modifiers: string; units: string; billed_amount_usd: string }
type Enrollment = { state_code: string; program: 'standard' | 'pediatric'; coverage_effective_date: string; status: string }
type Claim = {
  id: string
  service_date: string
  provider_npi: string
  status: string
  coverage_determination: string
  total_billed_usd: number
  diagnosis_codes: string[]
  lines: Array<{ line_number: number; code_system: CodeSystem; code: string }>
}
type HealthService = {
  id: string
  name: string
  description: string
  timezone: string
  slot_minutes: number
  available_to_all: boolean
  hours: Array<{ weekday: number; starts_at: string; ends_at: string }>
}
type Appointment = {
  id: string
  service_id: string
  service_name: string
  starts_at: string
  ends_at: string
  status: string
}
type Dashboard = {
  enrollment: Enrollment | null
  claims: Claim[]
  services: HealthService[]
  appointments: Appointment[]
  code_reference_version: string
  service_access: string
}

const emptyLine = (): ClaimLineForm => ({
  code_system: 'HCPCS_LEVEL_II', code: '', modifiers: '', units: '1', billed_amount_usd: '',
})

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function HealthInsurancePage() {
  const { token } = useAuth()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [stateCode, setStateCode] = useState('MD')
  const [program, setProgram] = useState<'standard' | 'pediatric'>('standard')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [enrollmentAttested, setEnrollmentAttested] = useState(false)
  const [serviceDate, setServiceDate] = useState('')
  const [providerNpi, setProviderNpi] = useState('')
  const [placeOfService, setPlaceOfService] = useState('')
  const [diagnoses, setDiagnoses] = useState('')
  const [lines, setLines] = useState<ClaimLineForm[]>([emptyLine()])
  const [claimAttested, setClaimAttested] = useState(false)
  const [claimService, setClaimService] = useState('')
  const [appointmentService, setAppointmentService] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('13:00')
  const [appointmentAttested, setAppointmentAttested] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function authenticatedFetch(path: string, init: RequestInit = {}) {
    if (!token) return new Response(JSON.stringify({ detail: 'Authentication required' }), { status: 401 })
    const send = (authToken: string) => {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${authToken}`)
      return fetch(`${ORG_API_BASE}${path}`, { ...init, headers })
    }
    let response = await send(token)
    if (response.status === 401) {
      const refreshed = await refreshRuntimeTokenFromSession()
      if (refreshed) response = await send(refreshed)
    }
    return response
  }

  async function responseDetail(response: Response, fallback: string) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string }
    return body.detail || fallback
  }

  async function loadDashboard() {
    const response = await authenticatedFetch('/api/health-insurance')
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load health-benefit intake.'))
    const data = (await response.json()) as Dashboard
    setDashboard(data)
    if (!appointmentService && data.services[0]) setAppointmentService(data.services[0].id)
    if (!claimService && data.services[0]) setClaimService(data.services[0].id)
    if (data.enrollment) {
      setStateCode(data.enrollment.state_code)
      setProgram(data.enrollment.program)
      setEffectiveDate(data.enrollment.coverage_effective_date)
    }
  }

  useEffect(() => {
    loadDashboard().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load.')).finally(() => setLoading(false))
    // The token identifies this member; form state is intentionally local.
  }, [token])

  async function saveEnrollment(event: FormEvent) {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/enrollment', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_code: stateCode, program, coverage_effective_date: effectiveDate, attested: enrollmentAttested }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to save enrollment.'))
      setEnrollmentAttested(false)
      await loadDashboard()
      setMessage('Coverage details saved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save enrollment.')
    } finally { setSaving(false) }
  }

  function updateLine(index: number, patch: Partial<ClaimLineForm>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }

  async function submitClaim(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/claims', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: claimService,
          service_date: serviceDate,
          provider_npi: providerNpi,
          place_of_service: placeOfService,
          diagnosis_codes: diagnoses.split(',').map((code) => code.trim()).filter(Boolean),
          lines: lines.map((line) => ({
            ...line,
            modifiers: line.modifiers.split(',').map((modifier) => modifier.trim()).filter(Boolean),
            units: Number(line.units),
            billed_amount_usd: Number(line.billed_amount_usd),
          })),
          attested: claimAttested,
        }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to submit claim intake.'))
      setServiceDate(''); setProviderNpi(''); setPlaceOfService(''); setDiagnoses(''); setLines([emptyLine()]); setClaimAttested(false)
      await loadDashboard()
      setMessage('Claim codes recorded.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit claim intake.')
    } finally { setSubmitting(false) }
  }

  async function scheduleAppointment(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: appointmentService, starts_at: `${appointmentDate}T${appointmentTime}:00.000Z`, attested: appointmentAttested }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to request appointment.'))
      setAppointmentDate(''); setAppointmentAttested(false)
      await loadDashboard()
      setMessage('Appointment requested. It remains pending until the service confirms it.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to request appointment.')
    } finally { setSubmitting(false) }
  }

  async function cancelAppointment(appointmentId: string) {
    setError(''); setMessage('')
    const response = await authenticatedFetch(`/api/health-insurance/appointments/${encodeURIComponent(appointmentId)}/cancel`, { method: 'POST' })
    if (!response.ok) { setError(await responseDetail(response, 'Unable to cancel appointment.')); return }
    await loadDashboard()
    setMessage('Appointment cancelled.')
  }

  if (loading) return <main className="health-insurance-page"><p>Loading health-benefit intake…</p></main>

  return (
    <main className="health-insurance-page">
      <section className="portal-hero health-insurance-hero">
        <div>
          <span className="health-insurance-eyebrow">Independent health subsystem</span>
          <h1>Health insurance code intake</h1>
          <p>Record coverage details, submit standardized claim codes, and schedule available services.</p>
        </div>
      </section>

      {error ? <div className="health-insurance-alert error" role="alert">{error}</div> : null}
      {message ? <div className="health-insurance-alert success" role="status">{message}</div> : null}

      <section className="health-insurance-grid">
        <form className="portal-card portal-form health-insurance-card" onSubmit={saveEnrollment}>
          <span className="health-insurance-eyebrow">Step 1</span>
          <h2>Coverage record</h2>
          <p>Choose the coverage program and effective date.</p>
          <label>State or territory
            <select value={stateCode} onChange={(event) => setStateCode(event.target.value)} required>
              {STATES.map(([code, name]) => <option value={code} key={code}>{name}</option>)}
            </select>
          </label>
          <label>Program
            <select value={program} onChange={(event) => setProgram(event.target.value as 'standard' | 'pediatric')} required>
              <option value="standard">Standard</option><option value="pediatric">Pediatric</option>
            </select>
          </label>
          <label>Coverage effective date
            <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} required />
          </label>
          <label className="health-insurance-check">
            <input type="checkbox" checked={enrollmentAttested} onChange={(event) => setEnrollmentAttested(event.target.checked)} required />
            <span>I attest that this member-provided coverage information is accurate.</span>
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save coverage record'}</button>
        </form>

        <form className="portal-card portal-form health-insurance-card health-insurance-claim" onSubmit={submitClaim}>
          <span className="health-insurance-eyebrow">Step 2</span>
          <h2>Claim-code intake</h2>
          <p>Enter codes exactly as supplied by the provider. Do not include clinical notes.</p>
          <div className="health-insurance-fields">
            <label>Available service<select value={claimService} onChange={(event) => setClaimService(event.target.value)} required>
              {dashboard?.services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
            </select></label>
            <label>Service date<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} required /></label>
            <label>Provider NPI<input inputMode="numeric" maxLength={10} value={providerNpi} onChange={(event) => setProviderNpi(event.target.value)} placeholder="10 digits" required /></label>
            <label>Place of service<input inputMode="numeric" maxLength={2} value={placeOfService} onChange={(event) => setPlaceOfService(event.target.value)} placeholder="11" required /></label>
            <label>ICD-10-CM diagnoses<input value={diagnoses} onChange={(event) => setDiagnoses(event.target.value)} placeholder="E11.9, I10" required /></label>
          </div>
          <div className="health-insurance-lines">
            <div className="health-insurance-line-heading"><h3>Claim lines</h3><button type="button" className="portal-button-secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>Add line</button></div>
            {lines.map((line, index) => (
              <fieldset className="health-insurance-line" key={index}>
                <legend>Line {index + 1}</legend>
                <label>Code system<select value={line.code_system} onChange={(event) => updateLine(index, { code_system: event.target.value as CodeSystem })}>
                  <option value="HCPCS_LEVEL_II">HCPCS Level II</option><option value="CPT">CPT</option><option value="ICD10_PCS">ICD-10-PCS</option><option value="NDC">NDC</option>
                </select></label>
                <label>Code<input value={line.code} onChange={(event) => updateLine(index, { code: event.target.value })} required /></label>
                <label>Modifiers<input value={line.modifiers} onChange={(event) => updateLine(index, { modifiers: event.target.value })} placeholder="NU, RR" /></label>
                <label>Units<input type="number" min="1" max="999" value={line.units} onChange={(event) => updateLine(index, { units: event.target.value })} required /></label>
                <label>Billed USD<input type="number" min="0" max="1000000" step="0.01" value={line.billed_amount_usd} onChange={(event) => updateLine(index, { billed_amount_usd: event.target.value })} required /></label>
                {lines.length > 1 ? <button type="button" className="portal-button-secondary" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove</button> : null}
              </fieldset>
            ))}
          </div>
          <label className="health-insurance-check">
            <input type="checkbox" checked={claimAttested} onChange={(event) => setClaimAttested(event.target.checked)} required />
            <span>I attest that these codes match the provider document.</span>
          </label>
          <button type="submit" disabled={!dashboard?.enrollment || !claimService || submitting}>{submitting ? 'Submitting…' : 'Submit claim codes'}</button>
          {!dashboard?.enrollment ? <small>Save a coverage record before submitting a claim.</small> : null}
        </form>
      </section>

      <section className="portal-card health-insurance-calendar">
        <div className="health-insurance-calendar-copy">
          <span className="health-insurance-eyebrow">Available to every member</span>
          <h2>Appointment calendar</h2>
          <p>{dashboard?.service_access}</p>
          <div className="health-insurance-services">
            {dashboard?.services.map((service) => <article key={service.id}><strong>{service.name}</strong><span>{service.description}</span><small>Weekdays, 13:00–21:00 UTC</small></article>)}
          </div>
        </div>
        <form className="portal-form health-insurance-scheduler" onSubmit={scheduleAppointment}>
          <label>Service<select value={appointmentService} onChange={(event) => setAppointmentService(event.target.value)} required>
            {dashboard?.services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
          </select></label>
          <label>Date<input type="date" value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} required /></label>
          <label>Time (UTC)<select value={appointmentTime} onChange={(event) => setAppointmentTime(event.target.value)}>
            {Array.from({ length: 16 }, (_, index) => {
              const minutes = 13 * 60 + index * 30
              const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
              return <option value={value} key={value}>{value}</option>
            })}
          </select></label>
          <label className="health-insurance-check"><input type="checkbox" checked={appointmentAttested} onChange={(event) => setAppointmentAttested(event.target.checked)} required /><span>Request this published slot.</span></label>
          <button type="submit" disabled={!dashboard?.services.length || submitting}>Request appointment</button>
        </form>
        <div className="health-insurance-appointments">
          <h3>Your appointments</h3>
          {dashboard?.appointments.length ? dashboard.appointments.map((appointment) => (
            <article key={appointment.id}>
              <div><strong>{appointment.service_name}</strong><span>{new Date(appointment.starts_at).toLocaleString()}</span></div>
              <div><span>{label(appointment.status)}</span>{['requested', 'confirmed'].includes(appointment.status) ? <button type="button" className="portal-button-secondary" onClick={() => cancelAppointment(appointment.id)}>Cancel</button> : null}</div>
            </article>
          )) : <p>No appointments requested.</p>}
        </div>
      </section>

      <section className="portal-card health-insurance-history">
        <div><span className="health-insurance-eyebrow">Member record</span><h2>Recent submissions</h2></div>
        {dashboard?.claims.length ? (
          <div className="health-insurance-claim-list">
            {dashboard.claims.map((claimItem) => (
              <article key={claimItem.id}>
                <div><strong>{claimItem.service_date}</strong><span>{claimItem.lines.map((line) => line.code).join(', ')}</span></div>
                <div><span>{label(claimItem.status)}</span><strong>{label(claimItem.coverage_determination)}</strong></div>
              </article>
            ))}
          </div>
        ) : <p>No claim codes have been submitted.</p>}
      </section>

    </main>
  )
}
