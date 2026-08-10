import { useDeferredValue, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/AppProviders'
import { pidpUrl } from '../../config/pidp'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

const ORG_API_BASE = '/api/org'

type CodeSystem = 'HCPCS_LEVEL_II' | 'CPT' | 'ICD10_PCS' | 'NDC'
type ClaimLineForm = {
  code_system: CodeSystem
  code: string
  modifiers: string
  units: string
  billed_amount_usd: string
  search: string
}
type DiagnosisEntry = { code: string; label: string; description: string; keywords: string[] }
type CollaborativeDiagnosis = {
  id: string
  patient_user_id: string
  code: string
  label: string
  description: string
  note: string
  submitted_by_user_id: string
  submitted_by_name: string
  self_reported: boolean
  supporter_count: number
  supporters: Array<{ supporter_user_id: string; supporter_name: string; created_at: string }>
  viewer_supports: boolean
  created_at: string
  updated_at: string
}
type MemberAccount = { id: string; user_id: string | null; name: string; email: string }
type HostOrganization = { id: string; name: string; slug: string; my_role?: 'owner' | 'administrator' | 'member' | null }
type DiagnosisBoard = {
  patient: { user_id: string; name: string; is_self: boolean }
  diagnoses: CollaborativeDiagnosis[]
  diagnosis_reference_version: string
  code_catalog: { diagnoses: DiagnosisEntry[] }
}
type ClaimCodeEntry = { code_system: CodeSystem; code: string; label: string; description: string; keywords: string[] }
type Enrollment = {
  program: 'standard' | 'pediatric'
  coverage_effective_date: string
  status: string
  issue_summary: string
  suspected_diagnosis_codes: string[]
  suspected_diagnosis_details: DiagnosisEntry[]
}
type Claim = {
  id: string
  service_date: string
  provider_npi: string
  status: string
  coverage_determination: string
  total_billed_usd: number
  diagnosis_codes: string[]
  diagnosis_details: DiagnosisEntry[]
  suspected_diagnosis_codes: string[]
  suspected_diagnosis_details: DiagnosisEntry[]
  issue_summary: string
  line_details: Array<{ code_system: CodeSystem; code: string; label: string; description: string }>
  lines: Array<{ line_number: number; code_system: CodeSystem; code: string }>
}
type HealthService = {
  id: string
  name: string
  description: string
  timezone: string
  slot_minutes: number
  available_to_all: boolean
  host_type: 'shared' | 'individual' | 'org'
  host_user_id?: string | null
  host_user_name?: string | null
  host_org_id?: string | null
  host_org_name?: string | null
  google_calendar_sync?: boolean
  google_block_busy?: boolean
  hours: Array<{ weekday: number; starts_at: string; ends_at: string }>
}
type GoogleCalendarConnection = {
  connected: boolean
  google_email: string | null
  calendar_id: string | null
  sync_busy: boolean
  updated_at: string | null
}
type Appointment = {
  id: string
  service_id: string
  service_name: string
  starts_at: string
  ends_at: string
  status: string
}
type AnalysisRun = {
  id: string
  analysis_kind: 'record-summary' | 'triage' | 'service-match'
  status: string
  requested_at: string
  summary: { headline: string; findings: string[]; next_steps: string[] }
}
type HistoryEvent = {
  id: string
  event_type: 'profile_update' | 'claim' | 'appointment' | 'analysis' | 'diagnosis'
  occurred_at: string
  title: string
  summary: string
  metadata: Record<string, unknown>
}
type Dashboard = {
  enrollment: Enrollment | null
  claims: Claim[]
  services: HealthService[]
  appointments: Appointment[]
  analyses: AnalysisRun[]
  collaborative_diagnoses: CollaborativeDiagnosis[]
  history: HistoryEvent[]
  code_reference_version: string
  diagnosis_reference_version: string
  service_access: string
  code_catalog: { diagnoses: DiagnosisEntry[]; claim_codes: ClaimCodeEntry[] }
}

function normalizeDashboard(data: Dashboard): Dashboard {
  return {
    ...data,
    claims: Array.isArray(data.claims) ? data.claims : [],
    services: Array.isArray(data.services) ? data.services : [],
    appointments: Array.isArray(data.appointments) ? data.appointments : [],
    analyses: Array.isArray(data.analyses) ? data.analyses : [],
    collaborative_diagnoses: Array.isArray(data.collaborative_diagnoses) ? data.collaborative_diagnoses : [],
    history: Array.isArray(data.history) ? data.history : [],
    code_catalog: {
      diagnoses: Array.isArray(data.code_catalog?.diagnoses) ? data.code_catalog.diagnoses : [],
      claim_codes: Array.isArray(data.code_catalog?.claim_codes) ? data.code_catalog.claim_codes : [],
    },
  }
}

function normalizeDiagnosisBoard(data: DiagnosisBoard): DiagnosisBoard {
  return {
    ...data,
    diagnoses: Array.isArray(data.diagnoses) ? data.diagnoses : [],
    code_catalog: {
      diagnoses: Array.isArray(data.code_catalog?.diagnoses) ? data.code_catalog.diagnoses : [],
    },
  }
}

const emptyLine = (): ClaimLineForm => ({
  code_system: 'HCPCS_LEVEL_II', code: '', modifiers: '', units: '1', billed_amount_usd: '', search: '',
})

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function weekdayLabel(value: number) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][value] || String(value)
}

function serviceHostLabel(service: HealthService) {
  if (service.host_type === 'individual' && service.host_user_name) return service.host_user_name
  if (service.host_type === 'org' && service.host_org_name) return service.host_org_name
  return 'Shared service'
}

function slotOptionsForService(service: HealthService | null) {
  const firstWindow = service?.hours[0]
  if (!firstWindow) return []
  const startMinutes = Number(firstWindow.starts_at.slice(0, 2)) * 60 + Number(firstWindow.starts_at.slice(3, 5))
  const endMinutes = Number(firstWindow.ends_at.slice(0, 2)) * 60 + Number(firstWindow.ends_at.slice(3, 5))
  const count = Math.max(1, Math.floor((endMinutes - startMinutes) / service.slot_minutes))
  return Array.from({ length: count }, (_, index) => {
    const minutes = startMinutes + index * service.slot_minutes
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  })
}

function fuzzyScore(query: string, candidate: string) {
  const normalizedQuery = query.trim().toLowerCase()
  const normalizedCandidate = candidate.toLowerCase()
  if (!normalizedQuery) return 0
  if (normalizedCandidate === normalizedQuery) return 500
  if (normalizedCandidate.startsWith(normalizedQuery)) return 250
  if (normalizedCandidate.includes(normalizedQuery)) return 100
  let score = 0
  let index = 0
  for (const character of normalizedQuery) {
    index = normalizedCandidate.indexOf(character, index)
    if (index === -1) return -1
    score += 5
    index += 1
  }
  return score
}

function searchDiagnoses(entries: DiagnosisEntry[], query: string, selectedCodes: string[]) {
  const selected = new Set(selectedCodes)
  const normalizedQuery = query.trim()
  return entries
    .filter((entry) => !selected.has(entry.code))
    .map((entry) => ({
      entry,
      score: Math.max(
        fuzzyScore(normalizedQuery, entry.code),
        fuzzyScore(normalizedQuery, entry.label),
        ...entry.keywords.map((keyword) => fuzzyScore(normalizedQuery, keyword)),
      ),
    }))
    .filter((result) => !normalizedQuery || result.score >= 0)
    .sort((left, right) => right.score - left.score || left.entry.code.localeCompare(right.entry.code))
    .slice(0, 8)
    .map((result) => result.entry)
}

function searchClaimCodes(entries: ClaimCodeEntry[], query: string, codeSystem: CodeSystem) {
  const normalizedQuery = query.trim()
  return entries
    .filter((entry) => entry.code_system === codeSystem)
    .map((entry) => ({
      entry,
      score: Math.max(
        fuzzyScore(normalizedQuery, entry.code),
        fuzzyScore(normalizedQuery, entry.label),
        ...entry.keywords.map((keyword) => fuzzyScore(normalizedQuery, keyword)),
      ),
    }))
    .filter((result) => !normalizedQuery || result.score >= 0)
    .sort((left, right) => right.score - left.score || left.entry.code.localeCompare(right.entry.code))
    .slice(0, 8)
    .map((result) => result.entry)
}

function DiagnosisSelector({
  title,
  query,
  setQuery,
  selectedCodes,
  setSelectedCodes,
  entries,
}: {
  title: string
  query: string
  setQuery: (value: string) => void
  selectedCodes: string[]
  setSelectedCodes: (codes: string[]) => void
  entries: DiagnosisEntry[]
}) {
  const deferredQuery = useDeferredValue(query)
  const matches = searchDiagnoses(entries, deferredQuery, selectedCodes)
  const byCode = new Map(entries.map((entry) => [entry.code, entry]))
  return (
    <div className="health-insurance-selector">
      <label>{title}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by diagnosis name or code" />
      </label>
      <div className="health-insurance-chip-list">
        {selectedCodes.length ? selectedCodes.map((code) => {
          const entry = byCode.get(code)
          return (
            <button key={code} type="button" className="health-insurance-chip" onClick={() => setSelectedCodes(selectedCodes.filter((item) => item !== code))}>
              <strong>{code}</strong>
              <span>{entry?.label || code}</span>
            </button>
          )
        }) : <p>No diagnoses selected.</p>}
      </div>
      <div className="health-insurance-search-results">
        {matches.map((entry) => (
          <button key={entry.code} type="button" className="health-insurance-search-result" onClick={() => {
            setSelectedCodes([...selectedCodes, entry.code])
            setQuery('')
          }}>
            <strong>{entry.code}</strong>
            <span>{entry.label}</span>
            <small>{entry.description}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

export function HealthInsurancePage() {
  const { token, user } = useAuth()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [diagnosisBoard, setDiagnosisBoard] = useState<DiagnosisBoard | null>(null)
  const [members, setMembers] = useState<MemberAccount[]>([])
  const [hostOrganizations, setHostOrganizations] = useState<HostOrganization[]>([])
  const [patientQuery, setPatientQuery] = useState('')
  const [selectedPatientUserId, setSelectedPatientUserId] = useState('')
  const [program, setProgram] = useState<'standard' | 'pediatric'>('standard')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [issueSummary, setIssueSummary] = useState('')
  const [suspectedDiagnoses, setSuspectedDiagnoses] = useState<string[]>([])
  const [suspectedQuery, setSuspectedQuery] = useState('')
  const [enrollmentAttested, setEnrollmentAttested] = useState(false)
  const [serviceDate, setServiceDate] = useState('')
  const [providerNpi, setProviderNpi] = useState('')
  const [placeOfService, setPlaceOfService] = useState('')
  const [confirmedDiagnoses, setConfirmedDiagnoses] = useState<string[]>([])
  const [confirmedQuery, setConfirmedQuery] = useState('')
  const [claimIssueSummary, setClaimIssueSummary] = useState('')
  const [claimSuspectedDiagnoses, setClaimSuspectedDiagnoses] = useState<string[]>([])
  const [claimSuspectedQuery, setClaimSuspectedQuery] = useState('')
  const [lines, setLines] = useState<ClaimLineForm[]>([emptyLine()])
  const [claimAttested, setClaimAttested] = useState(false)
  const [claimService, setClaimService] = useState('')
  const [appointmentService, setAppointmentService] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('14:00')
  const [appointmentAttested, setAppointmentAttested] = useState(false)
  const [publishHostType, setPublishHostType] = useState<'individual' | 'org'>('individual')
  const [publishHostOrgId, setPublishHostOrgId] = useState('')
  const [publishName, setPublishName] = useState('Half-hour session')
  const [publishDescription, setPublishDescription] = useState('Book a 30-minute session through the health portal.')
  const [publishStartsAt, setPublishStartsAt] = useState('14:00')
  const [publishEndsAt, setPublishEndsAt] = useState('17:00')
  const [publishCapacity, setPublishCapacity] = useState('1')
  const [publishWeekdays, setPublishWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [publishGoogleCalendarSync, setPublishGoogleCalendarSync] = useState(false)
  const [publishGoogleBlockBusy, setPublishGoogleBlockBusy] = useState(false)
  const [googleCalendar, setGoogleCalendar] = useState<GoogleCalendarConnection | null>(null)
  const [diagnosisSubmitQuery, setDiagnosisSubmitQuery] = useState('')
  const [diagnosisSubmitCodes, setDiagnosisSubmitCodes] = useState<string[]>([])
  const [diagnosisSubmitNote, setDiagnosisSubmitNote] = useState('')
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

  async function authenticatedPidpFetch(path: string, init: RequestInit = {}) {
    const send = async (authToken?: string) => {
      const headers = new Headers(init.headers)
      if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
      return fetch(pidpUrl(path), { ...init, headers, credentials: 'include' })
    }
    let response = await send(token || undefined)
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
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load health-benefit record.'))
    const data = normalizeDashboard((await response.json()) as Dashboard)
    setDashboard(data)
    if (!appointmentService && data.services[0]) setAppointmentService(data.services[0].id)
    if (!claimService && data.services[0]) setClaimService(data.services[0].id)
    if (data.enrollment) {
      setProgram(data.enrollment.program)
      setEffectiveDate(data.enrollment.coverage_effective_date)
      setIssueSummary(data.enrollment.issue_summary || '')
      setSuspectedDiagnoses(data.enrollment.suspected_diagnosis_codes || [])
      if (!claimIssueSummary) setClaimIssueSummary(data.enrollment.issue_summary || '')
      if (!claimSuspectedDiagnoses.length) setClaimSuspectedDiagnoses(data.enrollment.suspected_diagnosis_codes || [])
    }
  }

  async function loadMembers(query = '') {
    const response = await authenticatedFetch(`/api/accounts?sort=name_asc&limit=20&q=${encodeURIComponent(query)}`)
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load members.'))
    const data = (await response.json()) as MemberAccount[]
    setMembers(data.filter((member) => member.user_id))
  }

  async function loadHostOrganizations() {
    const response = await authenticatedFetch('/api/network/orgs?mine=true&limit=300')
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load organizations.'))
    const data = (await response.json()) as HostOrganization[] | Record<string, unknown>
    setHostOrganizations((Array.isArray(data) ? data : []).filter((org) => org.my_role === 'owner' || org.my_role === 'administrator'))
  }

  async function loadDiagnosisBoard(patientUserId: string) {
    const response = await authenticatedFetch(`/api/health-insurance/diagnoses?patient_user_id=${encodeURIComponent(patientUserId)}`)
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load diagnosis board.'))
    setDiagnosisBoard(normalizeDiagnosisBoard((await response.json()) as DiagnosisBoard))
  }

  async function loadGoogleCalendar() {
    const response = await authenticatedPidpFetch('/auth/google-calendar')
    if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load Google Calendar connection.'))
    setGoogleCalendar((await response.json()) as GoogleCalendarConnection)
  }

  useEffect(() => {
    loadDashboard().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load.')).finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    const ownUserId = user?.id || ''
    if (ownUserId && !selectedPatientUserId) setSelectedPatientUserId(ownUserId)
  }, [user, selectedPatientUserId])

  useEffect(() => {
    loadMembers(patientQuery).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load members.'))
  }, [patientQuery])

  useEffect(() => {
    loadHostOrganizations().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load organizations.'))
  }, [token])

  useEffect(() => {
    loadGoogleCalendar().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load Google Calendar connection.'))
  }, [token])

  useEffect(() => {
    if (!selectedPatientUserId) return
    loadDiagnosisBoard(selectedPatientUserId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load diagnosis board.'))
  }, [selectedPatientUserId, token])

  useEffect(() => {
    const selected = dashboard?.services.find((service) => service.id === appointmentService) || dashboard?.services[0] || null
    const firstSlot = slotOptionsForService(selected)[0]
    if (firstSlot) setAppointmentTime(firstSlot)
  }, [appointmentService, dashboard])

  async function saveEnrollment(event: FormEvent) {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/enrollment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program,
          coverage_effective_date: effectiveDate,
          suspected_diagnosis_codes: suspectedDiagnoses,
          issue_summary: issueSummary,
          attested: enrollmentAttested,
        }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to save health profile.'))
      setEnrollmentAttested(false)
      await loadDashboard()
      setMessage('Health profile saved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save health profile.')
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: claimService,
          service_date: serviceDate,
          provider_npi: providerNpi,
          place_of_service: placeOfService,
          diagnosis_codes: confirmedDiagnoses,
          suspected_diagnosis_codes: claimSuspectedDiagnoses,
          issue_summary: claimIssueSummary,
          lines: lines.map((line) => ({
            code_system: line.code_system,
            code: line.code,
            modifiers: line.modifiers.split(',').map((modifier) => modifier.trim()).filter(Boolean),
            units: Number(line.units),
            billed_amount_usd: Number(line.billed_amount_usd),
          })),
          attested: claimAttested,
        }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to submit claim intake.'))
      setServiceDate('')
      setProviderNpi('')
      setPlaceOfService('')
      setConfirmedDiagnoses([])
      setConfirmedQuery('')
      setLines([emptyLine()])
      setClaimAttested(false)
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: appointmentService, starts_at: `${appointmentDate}T${appointmentTime}:00.000Z`, attested: appointmentAttested }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to request appointment.'))
      setAppointmentDate('')
      setAppointmentAttested(false)
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

  async function runAnalysis(analysis_kind: AnalysisRun['analysis_kind']) {
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_kind }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to prepare analysis.'))
      await loadDashboard()
      setMessage(`${label(analysis_kind)} analysis prepared.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to prepare analysis.')
    } finally { setSubmitting(false) }
  }

  async function submitCollaborativeDiagnosis(event: FormEvent) {
    event.preventDefault()
    if (!diagnosisSubmitCodes[0]) return
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/diagnoses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_user_id: selectedPatientUserId, code: diagnosisSubmitCodes[0], note: diagnosisSubmitNote }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to submit diagnosis.'))
      setDiagnosisSubmitCodes([])
      setDiagnosisSubmitQuery('')
      setDiagnosisSubmitNote('')
      await loadDiagnosisBoard(selectedPatientUserId)
      setMessage('Diagnosis submitted and your support recorded.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit diagnosis.')
    } finally { setSubmitting(false) }
  }

  async function supportDiagnosis(code: string) {
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/diagnoses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_user_id: selectedPatientUserId, code }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to support diagnosis.'))
      await loadDiagnosisBoard(selectedPatientUserId)
      setMessage('Diagnosis support recorded.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to support diagnosis.')
    } finally { setSubmitting(false) }
  }

  async function publishService(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await authenticatedFetch('/api/health-insurance/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host_type: publishHostType,
          host_org_id: publishHostType === 'org' ? publishHostOrgId : null,
          name: publishName,
          description: publishDescription,
          timezone: 'UTC',
          slot_minutes: 30,
          capacity_per_slot: Number(publishCapacity),
          weekdays: publishWeekdays,
          starts_at: publishStartsAt,
          ends_at: publishEndsAt,
          google_calendar_sync: publishGoogleCalendarSync,
          google_block_busy: publishGoogleBlockBusy,
        }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to publish appointment calendar.'))
      await loadDashboard()
      await loadGoogleCalendar()
      setMessage('Recurring appointment calendar published.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to publish appointment calendar.')
    } finally { setSubmitting(false) }
  }

  async function disconnectGoogleCalendar() {
    setSubmitting(true); setError(''); setMessage('')
    try {
      const response = await authenticatedPidpFetch('/auth/google-calendar', { method: 'DELETE' })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to disconnect Google Calendar.'))
      await loadGoogleCalendar()
      setPublishGoogleCalendarSync(false)
      setPublishGoogleBlockBusy(false)
      setMessage('Google Calendar disconnected.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to disconnect Google Calendar.')
    } finally { setSubmitting(false) }
  }

  if (loading) return <main className="health-insurance-page"><p>Loading health-benefit intake…</p></main>

  const dashboardDiagnoses = dashboard?.code_catalog?.diagnoses ?? []
  const claimCodes = dashboard?.code_catalog?.claim_codes ?? []
  const diagnosisBoardDiagnoses = diagnosisBoard?.code_catalog?.diagnoses ?? dashboardDiagnoses
  const appointmentServiceEntry = dashboard?.services.find((service) => service.id === appointmentService) || dashboard?.services[0] || null
  const appointmentSlotOptions = slotOptionsForService(appointmentServiceEntry)

  return (
    <main className="health-insurance-page">
      <section className="portal-hero health-insurance-hero">
        <div>
          <span className="health-insurance-eyebrow">Independent health subsystem</span>
          <h1>Health record and code intake</h1>
          <p>Maintain a member health profile, search standardized codes by name, schedule services, and review the complete record history.</p>
        </div>
      </section>

      {error ? <div className="health-insurance-alert error" role="alert">{error}</div> : null}
      {message ? <div className="health-insurance-alert success" role="status">{message}</div> : null}

      <section className="health-insurance-grid">
        <form className="portal-card portal-form health-insurance-card" onSubmit={saveEnrollment}>
          <span className="health-insurance-eyebrow">Step 1</span>
          <h2>Health profile</h2>
          <p>Record the member’s current program, suspected diagnoses, and self-described issues.</p>
          <label>Program
            <select value={program} onChange={(event) => setProgram(event.target.value as 'standard' | 'pediatric')} required>
              <option value="standard">Standard</option>
              <option value="pediatric">Pediatric</option>
            </select>
          </label>
          <label>Coverage effective date
            <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} required />
          </label>
          <DiagnosisSelector
            title="Suspected diagnoses"
            query={suspectedQuery}
            setQuery={setSuspectedQuery}
            selectedCodes={suspectedDiagnoses}
            setSelectedCodes={setSuspectedDiagnoses}
            entries={dashboardDiagnoses}
          />
          <label>Describe your medical issues
            <textarea value={issueSummary} onChange={(event) => setIssueSummary(event.target.value)} rows={6} placeholder="Describe symptoms, chronic issues, recent changes, or anything else relevant." />
          </label>
          <label className="health-insurance-check">
            <input type="checkbox" checked={enrollmentAttested} onChange={(event) => setEnrollmentAttested(event.target.checked)} required />
            <span>I attest that this health profile reflects the member record I want on file.</span>
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save health profile'}</button>
        </form>

        <form className="portal-card portal-form health-insurance-card health-insurance-claim" onSubmit={submitClaim}>
          <span className="health-insurance-eyebrow">Step 2</span>
          <h2>Claim-code intake</h2>
          <p>Search standardized codes by name, record confirmed diagnoses, and snapshot the current member issue description.</p>
          <div className="health-insurance-fields">
            <label>Available service<select value={claimService} onChange={(event) => setClaimService(event.target.value)} required>
              {dashboard?.services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
            </select></label>
            <label>Service date<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} required /></label>
            <label>Provider NPI<input inputMode="numeric" maxLength={10} value={providerNpi} onChange={(event) => setProviderNpi(event.target.value)} placeholder="10 digits" required /></label>
            <label>Place of service<input inputMode="numeric" maxLength={2} value={placeOfService} onChange={(event) => setPlaceOfService(event.target.value)} placeholder="11" required /></label>
          </div>
          <DiagnosisSelector
            title="Confirmed diagnoses"
            query={confirmedQuery}
            setQuery={setConfirmedQuery}
            selectedCodes={confirmedDiagnoses}
            setSelectedCodes={setConfirmedDiagnoses}
            entries={dashboardDiagnoses}
          />
          <DiagnosisSelector
            title="Patient suspected diagnoses"
            query={claimSuspectedQuery}
            setQuery={setClaimSuspectedQuery}
            selectedCodes={claimSuspectedDiagnoses}
            setSelectedCodes={setClaimSuspectedDiagnoses}
            entries={dashboardDiagnoses}
          />
          <label>Describe your medical issues
            <textarea value={claimIssueSummary} onChange={(event) => setClaimIssueSummary(event.target.value)} rows={5} placeholder="Describe what the member is experiencing right now." />
          </label>
          <div className="health-insurance-lines">
            <div className="health-insurance-line-heading"><h3>Claim lines</h3><button type="button" className="portal-button-secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>Add line</button></div>
            {lines.map((line, index) => {
              const matches = searchClaimCodes(claimCodes, line.search, line.code_system)
              return (
                <fieldset className="health-insurance-line" key={index}>
                  <legend>Line {index + 1}</legend>
                  <label>Code system<select value={line.code_system} onChange={(event) => updateLine(index, { code_system: event.target.value as CodeSystem, search: '', code: '' })}>
                    <option value="HCPCS_LEVEL_II">HCPCS Level II</option>
                    <option value="CPT">CPT</option>
                    <option value="ICD10_PCS">ICD-10-PCS</option>
                    <option value="NDC">NDC</option>
                  </select></label>
                  <label>Search code by name<input value={line.search} onChange={(event) => updateLine(index, { search: event.target.value })} placeholder="Office visit, insulin, x-ray" /></label>
                  <label>Code<input value={line.code} onChange={(event) => updateLine(index, { code: event.target.value })} required /></label>
                  <label>Modifiers<input value={line.modifiers} onChange={(event) => updateLine(index, { modifiers: event.target.value })} placeholder="NU, RR" /></label>
                  <label>Units<input type="number" min="1" max="999" value={line.units} onChange={(event) => updateLine(index, { units: event.target.value })} required /></label>
                  <label>Billed USD<input type="number" min="0" max="1000000" step="0.01" value={line.billed_amount_usd} onChange={(event) => updateLine(index, { billed_amount_usd: event.target.value })} required /></label>
                  {lines.length > 1 ? <button type="button" className="portal-button-secondary" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove</button> : null}
                  <div className="health-insurance-search-results health-insurance-search-results-inline">
                    {matches.map((entry) => (
                      <button key={`${entry.code_system}:${entry.code}`} type="button" className="health-insurance-search-result" onClick={() => updateLine(index, { code: entry.code, search: `${entry.code} ${entry.label}` })}>
                        <strong>{entry.code}</strong>
                        <span>{entry.label}</span>
                        <small>{entry.description}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )
            })}
          </div>
          <label className="health-insurance-check">
            <input type="checkbox" checked={claimAttested} onChange={(event) => setClaimAttested(event.target.checked)} required />
            <span>I attest that these codes and issue details match the member record I am submitting.</span>
          </label>
          <button type="submit" disabled={!dashboard?.enrollment || !claimService || !confirmedDiagnoses.length || submitting}>{submitting ? 'Submitting…' : 'Submit claim codes'}</button>
          {!dashboard?.enrollment ? <small>Save a health profile before submitting claim codes.</small> : null}
        </form>
      </section>

      <section className="portal-card health-insurance-calendar">
        <div className="health-insurance-calendar-copy">
          <span className="health-insurance-eyebrow">Available to every member</span>
          <h2>Appointment calendar</h2>
          <p>{dashboard?.service_access}</p>
          <div className="health-insurance-services">
            {dashboard?.services.map((service) => <article key={service.id}><strong>{service.name}</strong><span>{service.description}</span><small>{serviceHostLabel(service)} · {service.hours.map((hour) => `${weekdayLabel(hour.weekday)} ${hour.starts_at}-${hour.ends_at}`).join(', ')} {service.timezone}</small></article>)}
          </div>
        </div>
        <form className="portal-form health-insurance-scheduler" onSubmit={scheduleAppointment}>
          <label>Service<select value={appointmentService} onChange={(event) => setAppointmentService(event.target.value)} required>
            {dashboard?.services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
          </select></label>
          <label>Date<input type="date" value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} required /></label>
          <label>Time (UTC)<select value={appointmentTime} onChange={(event) => setAppointmentTime(event.target.value)}>
            {appointmentSlotOptions.map((value) => <option value={value} key={value}>{value}</option>)}
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

      <section className="portal-card health-insurance-calendar">
        <div className="health-insurance-calendar-copy">
          <span className="health-insurance-eyebrow">Publish availability</span>
          <h2>Recurring half-hour sessions</h2>
          <p>Publish a personal or organization calendar so members can book 30-minute sessions on weekdays after 14:00 UTC.</p>
          <p>
            Google Calendar:
            {' '}
            {googleCalendar?.connected ? `Connected as ${googleCalendar.google_email || 'Google account'}` : 'Not connected'}
          </p>
          {googleCalendar?.connected ? (
            <button type="button" className="portal-button-secondary" onClick={() => void disconnectGoogleCalendar()} disabled={submitting}>
              Disconnect Google Calendar
            </button>
          ) : (
            <a
              className="portal-button-secondary"
              href={pidpUrl(`/auth/google-calendar/connect?next=${encodeURIComponent(window.location.href)}`)}
            >
              Connect Google Calendar
            </a>
          )}
        </div>
        <form className="portal-form health-insurance-scheduler" onSubmit={publishService}>
          <label>Host calendar<select value={publishHostType} onChange={(event) => setPublishHostType(event.target.value as 'individual' | 'org')}>
            <option value="individual">My calendar</option>
            <option value="org">Organization calendar</option>
          </select></label>
          {publishHostType === 'org' ? (
            <label>Organization<select value={publishHostOrgId} onChange={(event) => setPublishHostOrgId(event.target.value)} required>
              <option value="">Select an organization</option>
              {hostOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select></label>
          ) : null}
          <label>Session title<input value={publishName} onChange={(event) => setPublishName(event.target.value)} required /></label>
          <label>Description<textarea value={publishDescription} onChange={(event) => setPublishDescription(event.target.value)} rows={4} required /></label>
          <div className="health-insurance-fields">
            <label>Starts at (UTC)<input type="time" value={publishStartsAt} onChange={(event) => setPublishStartsAt(event.target.value)} required /></label>
            <label>Ends at (UTC)<input type="time" value={publishEndsAt} onChange={(event) => setPublishEndsAt(event.target.value)} required /></label>
            <label>Capacity per slot<input type="number" min="1" max="100" value={publishCapacity} onChange={(event) => setPublishCapacity(event.target.value)} required /></label>
          </div>
          <div className="health-insurance-selector">
            <strong>Weekdays</strong>
            <div className="health-insurance-chip-list">
              {[1, 2, 3, 4, 5].map((weekday) => {
                const selected = publishWeekdays.includes(weekday)
                return (
                  <button
                    key={weekday}
                    type="button"
                    className="health-insurance-chip"
                    aria-pressed={selected}
                    onClick={() => setPublishWeekdays((current) => selected ? current.filter((value) => value !== weekday) : [...current, weekday].sort((left, right) => left - right))}
                  >
                    <strong>{weekdayLabel(weekday)}</strong>
                    <span>{selected ? 'Included' : 'Excluded'}</span>
                  </button>
                )
              })}
            </div>
          </div>
          {publishHostType === 'individual' ? (
            <>
              <label className="health-insurance-check">
                <input
                  type="checkbox"
                  checked={publishGoogleCalendarSync}
                  onChange={(event) => {
                    setPublishGoogleCalendarSync(event.target.checked)
                    if (!event.target.checked) setPublishGoogleBlockBusy(false)
                  }}
                  disabled={!googleCalendar?.connected}
                />
                <span>Publish this recurring availability to my Google Calendar.</span>
              </label>
              <label className="health-insurance-check">
                <input
                  type="checkbox"
                  checked={publishGoogleBlockBusy}
                  onChange={(event) => setPublishGoogleBlockBusy(event.target.checked)}
                  disabled={!publishGoogleCalendarSync}
                />
                <span>Block portal slots that conflict with my Google busy times.</span>
              </label>
              {!googleCalendar?.connected ? <small>Connect Google Calendar first to enable sync for individual-hosted services.</small> : null}
            </>
          ) : <small>Google Calendar sync is currently available only for individual-hosted services.</small>}
          <button type="submit" disabled={submitting || (publishHostType === 'org' && !publishHostOrgId) || !publishWeekdays.length}>
            {submitting ? 'Publishing…' : 'Publish recurring session calendar'}
          </button>
        </form>
      </section>

      <section className="portal-card health-insurance-history">
        <div><span className="health-insurance-eyebrow">Collaborative diagnoses</span><h2>Diagnosis approvals</h2></div>
        <div className="health-insurance-selector">
          <label>Select patient
            <input value={patientQuery} onChange={(event) => setPatientQuery(event.target.value)} placeholder="Search member by name" />
          </label>
          <div className="health-insurance-search-results">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                className="health-insurance-search-result"
                onClick={() => { if (member.user_id) setSelectedPatientUserId(member.user_id); setPatientQuery('') }}
              >
                <strong>{member.name}</strong>
                <span>{member.user_id === selectedPatientUserId ? 'Selected patient' : member.email}</span>
              </button>
            ))}
          </div>
          {diagnosisBoard?.patient ? <p>Reviewing diagnosis approvals for <strong>{diagnosisBoard.patient.name}</strong>{diagnosisBoard.patient.is_self ? ' (you)' : ''}.</p> : null}
        </div>
        <form className="portal-form health-insurance-scheduler" onSubmit={submitCollaborativeDiagnosis}>
          <DiagnosisSelector
            title={diagnosisBoard?.patient.is_self ? 'Place a diagnosis on your collaborative board' : 'Contribute a diagnosis for this patient'}
            query={diagnosisSubmitQuery}
            setQuery={setDiagnosisSubmitQuery}
            selectedCodes={diagnosisSubmitCodes}
            setSelectedCodes={setDiagnosisSubmitCodes}
            entries={diagnosisBoardDiagnoses}
          />
          <label>Contribution note
            <textarea value={diagnosisSubmitNote} onChange={(event) => setDiagnosisSubmitNote(event.target.value)} rows={4} placeholder="Optional context for this diagnosis contribution." />
          </label>
          <button type="submit" disabled={!diagnosisSubmitCodes.length || submitting}>Contribute diagnosis</button>
        </form>
        <div className="health-insurance-analysis-list">
          {diagnosisBoard?.diagnoses.length ? diagnosisBoard.diagnoses.map((diagnosis) => (
            <article key={diagnosis.id}>
              <div>
                <strong>{diagnosis.code} {diagnosis.label}</strong>
                <span>{diagnosis.self_reported ? `Self-submitted by ${diagnosis.submitted_by_name}` : `Submitted by ${diagnosis.submitted_by_name}`}</span>
                {diagnosis.note ? <span>{diagnosis.note}</span> : null}
              </div>
              <div className="health-insurance-diagnosis-supporters">
                <strong>{diagnosis.supporter_count} approval{diagnosis.supporter_count === 1 ? '' : 's'}</strong>
                <span>{diagnosis.supporters.map((supporter) => supporter.supporter_name).join(', ')}</span>
                {!diagnosis.viewer_supports ? <button type="button" className="portal-button-secondary" onClick={() => supportDiagnosis(diagnosis.code)}>Approve diagnosis</button> : <span>You support this diagnosis.</span>}
              </div>
            </article>
          )) : <p>No collaborative diagnoses have been submitted yet.</p>}
        </div>
      </section>

      <section className="portal-card health-insurance-history">
        <div><span className="health-insurance-eyebrow">AI analysis stubs</span><h2>Record analysis</h2></div>
        <div className="health-insurance-analysis-actions">
          <button type="button" onClick={() => runAnalysis('record-summary')} disabled={submitting}>Prepare record summary</button>
          <button type="button" className="portal-button-secondary" onClick={() => runAnalysis('triage')} disabled={submitting}>Prepare triage</button>
          <button type="button" className="portal-button-secondary" onClick={() => runAnalysis('service-match')} disabled={submitting}>Prepare service match</button>
        </div>
        <div className="health-insurance-analysis-list">
          {dashboard?.analyses.length ? dashboard.analyses.map((analysis) => (
            <article key={analysis.id}>
              <div>
                <strong>{analysis.summary.headline}</strong>
                <span>{label(analysis.analysis_kind)} · {new Date(analysis.requested_at).toLocaleString()}</span>
              </div>
              <div>
                <span>{analysis.summary.findings.join(' • ')}</span>
              </div>
            </article>
          )) : <p>No analysis stubs have been prepared yet.</p>}
        </div>
      </section>

      <section className="portal-card health-insurance-history">
        <div><span className="health-insurance-eyebrow">Member record</span><h2>Entire history</h2></div>
        {dashboard?.history.length ? (
          <div className="health-insurance-claim-list">
            {dashboard.history.map((event) => (
              <article key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <span>{new Date(event.occurred_at).toLocaleString()}</span>
                  {event.summary ? <span>{event.summary}</span> : null}
                </div>
                <div>
                  <strong>{label(event.event_type)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : <p>No history has been recorded yet.</p>}
      </section>
    </main>
  )
}
