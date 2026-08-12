import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/AppProviders'
import {
  LIFE_INSURANCE_SOURCE,
  estimateLifeInsuranceDisbursement,
  globalPopulationAgeBands,
} from '../../domain/insurance/lifeInsuranceModel'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { formatDena } from './financeUtils'

const ORG_API_BASE = '/api/org'
const LIFE_INSURANCE_DRAFT_PREFIX = 'life-insurance.form-draft.v1'
const AGE_BANDS = globalPopulationAgeBands()
const LARGEST_AGE_BAND = Math.max(...AGE_BANDS.map((band) => band.populationPercent))

type InsuranceMember = {
  user_id: string
  account_id: string
  name: string
  photo_url: string | null
  enrolled: boolean
}

type InsuranceEnrollment = {
  user_id: string
  birth_date: string
  confirmed_age: number
  next_of_kin_user_id: string
  next_of_kin_name: string | null
  next_of_kin_photo_url: string | null
  next_of_kin_relationship: string
  beneficiary_user_id: string | null
  beneficiary_name: string | null
  beneficiary_photo_url: string | null
  beneficiary_relationship: string | null
  status: string
}

type InsuranceClaim = {
  id: string
  deceased_user_id: string
  status: string
  report_count: number
  attestation_threshold?: number
  payout_amount: number
  recipient_name: string
  beneficiary_source: 'beneficiary' | 'next_of_kin'
  currency?: string
}

type InsuranceDashboard = {
  currency: string
  standard_benefit_dena: number
  attestation_threshold: number
  profile_birth_date?: string | null
  enrollment: InsuranceEnrollment | null
  claim: InsuranceClaim | null
  members: InsuranceMember[]
}

type EnrollmentForm = {
  birth_date: string
  next_of_kin_user_id: string
  next_of_kin_relationship: string
  beneficiary_user_id: string
  beneficiary_relationship: string
  accepted_terms: boolean
}

type DeathReportForm = {
  deceased_user_id: string
  date_of_death: string
  relationship_to_deceased: string
  attested: boolean
}

const emptyEnrollment: EnrollmentForm = {
  birth_date: '',
  next_of_kin_user_id: '',
  next_of_kin_relationship: '',
  beneficiary_user_id: '',
  beneficiary_relationship: '',
  accepted_terms: false,
}

const emptyReport: DeathReportForm = {
  deceased_user_id: '',
  date_of_death: '',
  relationship_to_deceased: '',
  attested: false,
}

type LifeInsuranceDraft = {
  enrollment: EnrollmentForm
  death_report: DeathReportForm
}

function draftKey(userId: string) {
  return `${LIFE_INSURANCE_DRAFT_PREFIX}:${userId}`
}

function readDraft(userId: string): LifeInsuranceDraft | null {
  if (!userId) return null
  try {
    const parsed = JSON.parse(sessionStorage.getItem(draftKey(userId)) || 'null') as Partial<LifeInsuranceDraft> | null
    if (!parsed?.enrollment || !parsed.death_report) return null
    return { enrollment: { ...emptyEnrollment, ...parsed.enrollment }, death_report: { ...emptyReport, ...parsed.death_report } }
  } catch {
    return null
  }
}

function writeDraft(userId: string, draft: LifeInsuranceDraft) {
  if (!userId) return
  sessionStorage.setItem(draftKey(userId), JSON.stringify(draft))
}

function orgUrl(path: string) {
  return `${ORG_API_BASE}${path}`
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function memberInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
}

function calculateAgeFromBirthDate(birthDate: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const birth = new Date(`${birthDate}T00:00:00.000Z`)
  if (Number.isNaN(birth.getTime())) return null
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  const birthdayNotReached =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())
  if (birthdayNotReached) age -= 1
  return age
}

function MemberPicker(props: {
  id: string
  label: string
  value: string
  members: InsuranceMember[]
  required?: boolean
  emptyLabel: string
  onChange: (userId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = props.members.find((member) => member.user_id === props.value) || null
  const normalizedQuery = query.trim().toLowerCase()
  const results = props.members
    .filter((member) => !normalizedQuery || member.name.toLowerCase().includes(normalizedQuery))
    .slice(0, 20)

  return (
    <div className="life-insurance-member-picker">
      <label htmlFor={`${props.id}-search`}>{props.label}{props.required ? ' (required)' : ''}</label>
      {selected ? (
        <div className="life-insurance-selected-member" data-testid={`${props.id}-selected`}>
          <span className="life-insurance-member-avatar">
            {selected.photo_url ? <img src={selected.photo_url} alt="" /> : memberInitials(selected.name)}
          </span>
          <span><strong>{selected.name}</strong><small>Selected member</small></span>
          <button type="button" className="portal-button-secondary" onClick={() => { props.onChange(''); setQuery(''); setOpen(true) }}>
            {props.required ? 'Change' : 'Clear'}
          </button>
        </div>
      ) : null}
      <div className="life-insurance-member-search">
        <input
          id={`${props.id}-search`}
          type="search"
          role="combobox"
          aria-controls={`${props.id}-results`}
          aria-expanded={open}
          autoComplete="off"
          placeholder="Search members by name"
          required={Boolean(props.required && !selected)}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
        />
        {open ? (
          <div id={`${props.id}-results`} className="life-insurance-member-results" role="listbox">
            {!props.required ? <button type="button" role="option" aria-selected={!props.value} onClick={() => { props.onChange(''); setQuery(''); setOpen(false) }}>{props.emptyLabel}</button> : null}
            {results.map((member) => (
              <button
                type="button"
                role="option"
                aria-selected={member.user_id === props.value}
                key={member.user_id}
                onClick={() => { props.onChange(member.user_id); setQuery(''); setOpen(false) }}
              >
                <span className="life-insurance-member-avatar">
                  {member.photo_url ? <img src={member.photo_url} alt="" /> : memberInitials(member.name)}
                </span>
                <span>{member.name}</span>
              </button>
            ))}
            {!results.length ? <span className="life-insurance-member-empty">No members found</span> : null}
          </div>
        ) : null}
      </div>
      <input type="hidden" name={props.id} value={props.value} />
    </div>
  )
}

export function LifeInsurancePage() {
  const { token, user } = useAuth()
  const [dashboard, setDashboard] = useState<InsuranceDashboard | null>(null)
  const [enrollment, setEnrollment] = useState<EnrollmentForm>(emptyEnrollment)
  const [deathReport, setDeathReport] = useState<DeathReportForm>(emptyReport)
  const [reportResult, setReportResult] = useState<InsuranceClaim | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [status, setStatus] = useState('')
  const [reportStatus, setReportStatus] = useState('')

  async function authenticatedFetch(path: string, init: RequestInit = {}) {
    if (!token) return new Response(JSON.stringify({ detail: 'Authentication required' }), { status: 401 })
    const send = (authToken: string) => {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${authToken}`)
      return fetch(orgUrl(path), { ...init, headers })
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

  function applyDashboard(data: InsuranceDashboard, enrollmentDraft?: EnrollmentForm) {
    setDashboard(data)
    const canonicalBirthDate = data.profile_birth_date || data.enrollment?.birth_date || ''
    if (enrollmentDraft) {
      setEnrollment({ ...enrollmentDraft, birth_date: canonicalBirthDate })
    } else if (data.enrollment) {
      setEnrollment({
        birth_date: canonicalBirthDate,
        next_of_kin_user_id: data.enrollment.next_of_kin_user_id,
        next_of_kin_relationship: data.enrollment.next_of_kin_relationship,
        beneficiary_user_id: data.enrollment.beneficiary_user_id || '',
        beneficiary_relationship: data.enrollment.beneficiary_relationship || '',
        accepted_terms: false,
      })
    } else {
      setEnrollment((current) => ({ ...current, birth_date: canonicalBirthDate }))
    }
  }

  function updateEnrollment(next: EnrollmentForm) {
    setEnrollment(next)
    if (user?.id) writeDraft(user.id, { enrollment: next, death_report: deathReport })
  }

  function updateDeathReport(next: DeathReportForm) {
    setDeathReport(next)
    if (user?.id) writeDraft(user.id, { enrollment, death_report: next })
  }

  async function loadDashboard() {
    setLoading(true)
    try {
      const response = await authenticatedFetch('/api/life-insurance')
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load the life-benefit program.'))
      const data = (await response.json()) as InsuranceDashboard
      const draft = readDraft(user?.id || '')
      applyDashboard(data, draft?.enrollment)
      if (draft?.death_report) setDeathReport(draft.death_report)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load the life-benefit program.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadDashboard()
  }, [token, user?.id])

  async function saveEnrollment(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setStatus('')
    try {
      const response = await authenticatedFetch('/api/life-insurance/enrollment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...enrollment,
          beneficiary_user_id: enrollment.beneficiary_user_id || null,
          beneficiary_relationship: enrollment.beneficiary_user_id ? enrollment.beneficiary_relationship : null,
        }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to save enrollment.'))
      const data = (await response.json()) as InsuranceDashboard
      applyDashboard(data)
      const savedEnrollment = data.enrollment ? {
        birth_date: data.profile_birth_date || data.enrollment.birth_date,
        next_of_kin_user_id: data.enrollment.next_of_kin_user_id,
        next_of_kin_relationship: data.enrollment.next_of_kin_relationship,
        beneficiary_user_id: data.enrollment.beneficiary_user_id || '',
        beneficiary_relationship: data.enrollment.beneficiary_relationship || '',
        accepted_terms: false,
      } : emptyEnrollment
      if (user?.id) writeDraft(user.id, { enrollment: savedEnrollment, death_report: deathReport })
      setStatus('Enrollment saved. Your beneficiary selection is now active.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save enrollment.')
    } finally {
      setSaving(false)
    }
  }

  async function submitDeathReport(event: FormEvent) {
    event.preventDefault()
    setReporting(true)
    setReportStatus('')
    setReportResult(null)
    try {
      const response = await authenticatedFetch('/api/life-insurance/death-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deathReport),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to submit the death report.'))
      const claim = (await response.json()) as InsuranceClaim
      setReportResult(claim)
      updateDeathReport(emptyReport)
      setReportStatus(
        claim.status === 'paid'
          ? `Threshold reached. ${formatDena(claim.payout_amount)} was paid to ${claim.recipient_name}.`
          : `Report accepted. ${claim.report_count} of ${claim.attestation_threshold || dashboard?.attestation_threshold || 3} attestations received.`,
      )
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : 'Unable to submit the death report.')
    } finally {
      setReporting(false)
    }
  }

  const parsedAge = calculateAgeFromBirthDate(enrollment.birth_date)
  let estimate = null
  try {
    estimate = dashboard && parsedAge !== null
      ? estimateLifeInsuranceDisbursement(parsedAge, dashboard.standard_benefit_dena)
      : null
  } catch {
    estimate = null
  }
  const enrolledMembers = dashboard?.members.filter((member) => member.enrolled) || []

  return (
    <div className="life-insurance-page">
      <section className="portal-hero life-insurance-hero">
        <div>
          <span className="portal-pill">Dena member life benefit</span>
          <h1>Protect the people you name</h1>
          <p>
            Enroll with a verified birthday, name a beneficiary or next of kin, and let three distinct members
            attest when a member dies.
          </p>
        </div>
        <div className="life-insurance-privacy-card" aria-label="Program threshold">
          <strong>Required attestations</strong>
          <span>{dashboard?.attestation_threshold || 3}</span>
          <small>Unique authenticated members. Duplicate and self-reports do not count.</small>
        </div>
      </section>

      {dashboard?.claim ? (
        <div className="life-insurance-own-claim" role="alert">
          A death claim has been opened for your membership and is currently {statusLabel(dashboard.claim.status)}.
          Contact an administrator immediately if this is incorrect.
        </div>
      ) : null}

      <section className="life-insurance-workspace">
        <form className="portal-card portal-form life-insurance-form" onSubmit={saveEnrollment}>
          <div>
            <span className="life-insurance-step">Enrollment</span>
            <h2>{dashboard?.enrollment ? 'Review your coverage' : 'Enroll in the life benefit'}</h2>
            <p className="portal-muted">Fields marked required must be complete before coverage is recorded.</p>
          </div>

          <div className="life-insurance-field-grid">
            <div className="life-insurance-profile-birthday" data-testid="insurance-profile-birthday">
              <strong>Birthday on profile</strong>
              <span>{enrollment.birth_date || 'Add your birthday on your profile before enrolling.'}</span>
              <small>
                This value comes from your profile and is used everywhere in the insurance flow.
                {enrollment.birth_date ? ' Update it on your profile if it is wrong.' : ' Open your profile to add it.'}
              </small>
            </div>
            <div className="life-insurance-profile-birthday" data-testid="insurance-derived-age">
              <strong>Current age from profile birthday</strong>
              <span>{parsedAge === null ? 'Unavailable' : `${parsedAge}`}</span>
              <small>Age is derived automatically from your profile birthday. There is no separate age entry.</small>
            </div>
          </div>

          <MemberPicker
            id="insurance-next-of-kin"
            label="Next of kin"
            required
            value={enrollment.next_of_kin_user_id}
            members={dashboard?.members || []}
            emptyLabel="Select a member"
            onChange={(userId) => updateEnrollment({ ...enrollment, next_of_kin_user_id: userId })}
          />
          <label htmlFor="insurance-next-of-kin-relationship">
            Relationship to next of kin (required)
            <input
              id="insurance-next-of-kin-relationship"
              required
              maxLength={80}
              placeholder="For example: spouse, sibling, parent"
              value={enrollment.next_of_kin_relationship}
              onChange={(event) => updateEnrollment({ ...enrollment, next_of_kin_relationship: event.target.value })}
            />
          </label>

          <MemberPicker
            id="insurance-beneficiary"
            label="Named beneficiary (optional)"
            value={enrollment.beneficiary_user_id}
            members={dashboard?.members || []}
            emptyLabel="Use next of kin"
            onChange={(userId) => updateEnrollment({
              ...enrollment,
              beneficiary_user_id: userId,
              beneficiary_relationship: userId ? enrollment.beneficiary_relationship : '',
            })}
          />
          {enrollment.beneficiary_user_id ? (
            <label htmlFor="insurance-beneficiary-relationship">
              Relationship to beneficiary (required)
              <input
                id="insurance-beneficiary-relationship"
                required
                maxLength={80}
                placeholder="For example: partner, child, friend"
                value={enrollment.beneficiary_relationship}
                onChange={(event) => updateEnrollment({ ...enrollment, beneficiary_relationship: event.target.value })}
              />
            </label>
          ) : null}

          <label className="life-insurance-checkbox" htmlFor="insurance-enrollment-attestation">
            <input
              id="insurance-enrollment-attestation"
              type="checkbox"
              required
              checked={enrollment.accepted_terms}
              onChange={(event) => updateEnrollment({ ...enrollment, accepted_terms: event.target.checked })}
            />
            <span>I attest that my profile birthday and beneficiary information are accurate.</span>
          </label>
          <button type="submit" disabled={saving || loading}>{saving ? 'Saving…' : 'Save enrollment'}</button>
          {status ? <p className="life-insurance-form-status" role="status">{status}</p> : null}
        </form>

        <section className="portal-card life-insurance-result" aria-live="polite">
          <span className="life-insurance-step">Coverage preview</span>
          <h2>Estimated Dena disbursement</h2>
          {estimate ? (
            <>
              <strong className="life-insurance-amount">{formatDena(estimate.disbursement)}</strong>
              <div className="life-insurance-result-grid">
                <div><span>Age-equity factor</span><strong>{(estimate.benefitFactor * 100).toFixed(1)}%</strong></div>
                <div><span>Derived age</span><strong>{parsedAge}</strong></div>
                <div><span>Program standard benefit</span><strong>{formatDena(estimate.standardBenefit)}</strong></div>
              </div>
              <p>The amount is frozen when the first consistent death report opens a claim.</p>
            </>
          ) : <p>Add a valid birthday on your profile to preview coverage.</p>}
          {dashboard?.enrollment ? (
            <div className="life-insurance-designation">
              <strong>Current recipient order</strong>
              <span>Beneficiary: {dashboard.enrollment.beneficiary_name || 'Not named'}</span>
              <span>Fallback next of kin: {dashboard.enrollment.next_of_kin_name || 'Not available'}</span>
            </div>
          ) : null}
        </section>
      </section>

      <section className="portal-card life-insurance-death-report">
        <div className="life-insurance-section-heading">
          <div>
            <span className="life-insurance-step">Community attestation</span>
            <h2>Indicate that another member has died</h2>
          </div>
          <span>Three unique reports trigger the Dena payout</span>
        </div>
        <form className="portal-form life-insurance-report-form" onSubmit={submitDeathReport}>
          <label htmlFor="deceased-member">
            Deceased enrolled member (required)
            <select
              id="deceased-member"
              required
              value={deathReport.deceased_user_id}
              onChange={(event) => updateDeathReport({ ...deathReport, deceased_user_id: event.target.value })}
            >
              <option value="">Select a member</option>
              {enrolledMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
            </select>
          </label>
          <label htmlFor="date-of-death">
            Date of death (required)
            <input
              id="date-of-death"
              type="date"
              required
              value={deathReport.date_of_death}
              onChange={(event) => updateDeathReport({ ...deathReport, date_of_death: event.target.value })}
            />
          </label>
          <label htmlFor="relationship-to-deceased">
            Your relationship to the member (required)
            <input
              id="relationship-to-deceased"
              required
              maxLength={80}
              placeholder="For example: friend, family, colleague"
              value={deathReport.relationship_to_deceased}
              onChange={(event) => updateDeathReport({ ...deathReport, relationship_to_deceased: event.target.value })}
            />
          </label>
          <label className="life-insurance-checkbox" htmlFor="death-report-attestation">
            <input
              id="death-report-attestation"
              type="checkbox"
              required
              checked={deathReport.attested}
              onChange={(event) => updateDeathReport({ ...deathReport, attested: event.target.checked })}
            />
            <span>I attest that this report is truthful and understand a third unique report can release funds.</span>
          </label>
          <button type="submit" disabled={reporting || enrolledMembers.length === 0}>
            {reporting ? 'Submitting…' : 'Submit death report'}
          </button>
          {enrolledMembers.length === 0 ? <p>No other enrolled members are currently available to report.</p> : null}
          {reportStatus ? <p className="life-insurance-form-status" role="status">{reportStatus}</p> : null}
          {reportResult ? (
            <div className="life-insurance-claim-progress">
              <strong>{reportResult.report_count} / {reportResult.attestation_threshold || dashboard?.attestation_threshold || 3}</strong>
              <span>Status: {statusLabel(reportResult.status)}</span>
            </div>
          ) : null}
        </form>
      </section>

      <section className="portal-card life-insurance-pyramid" aria-labelledby="population-pyramid-title">
        <div className="life-insurance-section-heading">
          <div><span className="life-insurance-step">Method</span><h2 id="population-pyramid-title">Global age reference</h2></div>
          <span>{LIFE_INSURANCE_SOURCE.year} projection · both sexes</span>
        </div>
        <div className="life-insurance-bars" role="img" aria-label="Global population percentage by five-year age group">
          {[...AGE_BANDS].reverse().map((band) => {
            const current = parsedAge !== null && parsedAge >= band.startAge && parsedAge <= band.endAge
            return (
              <div className={`life-insurance-bar-row ${current ? 'current' : ''}`} key={band.label}>
                <span>{band.label}</span>
                <div className="life-insurance-bar-track"><span style={{ width: `${(band.populationPercent / LARGEST_AGE_BAND) * 100}%` }} /></div>
                <strong>{band.populationPercent.toFixed(1)}%</strong>
              </div>
            )
          })}
        </div>
        <p className="life-insurance-source">
          Source: <a href={LIFE_INSURANCE_SOURCE.url} target="_blank" rel="noreferrer">{LIFE_INSURANCE_SOURCE.name}</a>.
          Birthday determines age, and the insurance interface uses the birthday saved on your profile.
        </p>
      </section>
    </div>
  )
}
