import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/AppProviders'
import {
  LIFE_INSURANCE_SOURCE,
  MAX_MEMBER_AGE,
  MIN_MEMBER_AGE,
  estimateLifeInsuranceDisbursement,
  globalPopulationAgeBands,
} from '../../domain/insurance/lifeInsuranceModel'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { formatDena } from './financeUtils'

const ORG_API_BASE = '/api/org'
const AGE_BANDS = globalPopulationAgeBands()
const LARGEST_AGE_BAND = Math.max(...AGE_BANDS.map((band) => band.populationPercent))

type InsuranceMember = {
  user_id: string
  account_id: string
  name: string
  enrolled: boolean
}

type InsuranceEnrollment = {
  user_id: string
  birth_date: string
  confirmed_age: number
  next_of_kin_user_id: string
  next_of_kin_name: string | null
  next_of_kin_relationship: string
  beneficiary_user_id: string | null
  beneficiary_name: string | null
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
  enrollment: InsuranceEnrollment | null
  claim: InsuranceClaim | null
  members: InsuranceMember[]
}

type EnrollmentForm = {
  birth_date: string
  age: string
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
  age: '',
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

function orgUrl(path: string) {
  return `${ORG_API_BASE}${path}`
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

export function LifeInsurancePage() {
  const { token } = useAuth()
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

  function applyDashboard(data: InsuranceDashboard) {
    setDashboard(data)
    if (data.enrollment) {
      setEnrollment({
        birth_date: data.enrollment.birth_date,
        age: String(data.enrollment.confirmed_age),
        next_of_kin_user_id: data.enrollment.next_of_kin_user_id,
        next_of_kin_relationship: data.enrollment.next_of_kin_relationship,
        beneficiary_user_id: data.enrollment.beneficiary_user_id || '',
        beneficiary_relationship: data.enrollment.beneficiary_relationship || '',
        accepted_terms: false,
      })
    }
  }

  async function loadDashboard() {
    setLoading(true)
    try {
      const response = await authenticatedFetch('/api/life-insurance')
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to load the life-benefit program.'))
      applyDashboard((await response.json()) as InsuranceDashboard)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load the life-benefit program.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadDashboard()
  }, [token])

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
          age: Number(enrollment.age),
          beneficiary_user_id: enrollment.beneficiary_user_id || null,
          beneficiary_relationship: enrollment.beneficiary_user_id ? enrollment.beneficiary_relationship : null,
        }),
      })
      if (!response.ok) throw new Error(await responseDetail(response, 'Unable to save enrollment.'))
      applyDashboard((await response.json()) as InsuranceDashboard)
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
      setDeathReport(emptyReport)
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

  const parsedAge = Number(enrollment.age)
  let estimate = null
  try {
    estimate = dashboard
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
            <label htmlFor="insurance-birthday">
              Birthday (required)
              <input
                id="insurance-birthday"
                type="date"
                required
                value={enrollment.birth_date}
                onChange={(event) => setEnrollment({ ...enrollment, birth_date: event.target.value })}
              />
            </label>
            <label htmlFor="insurance-age">
              Current age (required)
              <input
                id="insurance-age"
                type="number"
                inputMode="numeric"
                min={MIN_MEMBER_AGE}
                max={MAX_MEMBER_AGE}
                step="1"
                required
                value={enrollment.age}
                onChange={(event) => setEnrollment({ ...enrollment, age: event.target.value })}
              />
            </label>
          </div>

          <label htmlFor="insurance-next-of-kin">
            Next of kin (required)
            <select
              id="insurance-next-of-kin"
              required
              value={enrollment.next_of_kin_user_id}
              onChange={(event) => setEnrollment({ ...enrollment, next_of_kin_user_id: event.target.value })}
            >
              <option value="">Select a member</option>
              {dashboard?.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
            </select>
          </label>
          <label htmlFor="insurance-next-of-kin-relationship">
            Relationship to next of kin (required)
            <input
              id="insurance-next-of-kin-relationship"
              required
              maxLength={80}
              placeholder="For example: spouse, sibling, parent"
              value={enrollment.next_of_kin_relationship}
              onChange={(event) => setEnrollment({ ...enrollment, next_of_kin_relationship: event.target.value })}
            />
          </label>

          <label htmlFor="insurance-beneficiary">
            Named beneficiary (optional)
            <select
              id="insurance-beneficiary"
              value={enrollment.beneficiary_user_id}
              onChange={(event) => setEnrollment({
                ...enrollment,
                beneficiary_user_id: event.target.value,
                beneficiary_relationship: event.target.value ? enrollment.beneficiary_relationship : '',
              })}
            >
              <option value="">Use next of kin</option>
              {dashboard?.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
            </select>
          </label>
          {enrollment.beneficiary_user_id ? (
            <label htmlFor="insurance-beneficiary-relationship">
              Relationship to beneficiary (required)
              <input
                id="insurance-beneficiary-relationship"
                required
                maxLength={80}
                placeholder="For example: partner, child, friend"
                value={enrollment.beneficiary_relationship}
                onChange={(event) => setEnrollment({ ...enrollment, beneficiary_relationship: event.target.value })}
              />
            </label>
          ) : null}

          <label className="life-insurance-checkbox" htmlFor="insurance-enrollment-attestation">
            <input
              id="insurance-enrollment-attestation"
              type="checkbox"
              required
              checked={enrollment.accepted_terms}
              onChange={(event) => setEnrollment({ ...enrollment, accepted_terms: event.target.checked })}
            />
            <span>I attest that my birthday, age, and beneficiary information are accurate.</span>
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
                <div><span>Program standard benefit</span><strong>{formatDena(estimate.standardBenefit)}</strong></div>
              </div>
              <p>The amount is frozen when the first consistent death report opens a claim.</p>
            </>
          ) : <p>Enter a valid birthday and matching age to preview coverage.</p>}
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
              onChange={(event) => setDeathReport({ ...deathReport, deceased_user_id: event.target.value })}
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
              onChange={(event) => setDeathReport({ ...deathReport, date_of_death: event.target.value })}
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
              onChange={(event) => setDeathReport({ ...deathReport, relationship_to_deceased: event.target.value })}
            />
          </label>
          <label className="life-insurance-checkbox" htmlFor="death-report-attestation">
            <input
              id="death-report-attestation"
              type="checkbox"
              required
              checked={deathReport.attested}
              onChange={(event) => setDeathReport({ ...deathReport, attested: event.target.checked })}
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
            const current = Number.isInteger(parsedAge) && parsedAge >= band.startAge && parsedAge <= band.endAge
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
          Birthday determines age; the separately required age field must match it.
        </p>
      </section>
    </div>
  )
}
