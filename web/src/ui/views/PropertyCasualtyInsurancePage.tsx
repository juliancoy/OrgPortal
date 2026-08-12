import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { formatDena } from './financeUtils'

const PROPERTY_CASUALTY_DRAFT_KEY = 'property-casualty-insurance.form-draft.v1'

type CoverageClass = 'property' | 'casualty' | 'bundle'
type IncidentType = 'property_damage' | 'liability' | 'vehicle' | 'business_interruption'

type CoverageForm = {
  coverage_class: CoverageClass
  asset_label: string
  replacement_value_dena: string
  deductible_dena: string
  stewardship_notes: string
  attested: boolean
}

type ClaimForm = {
  incident_date: string
  incident_type: IncidentType
  requested_reserve_dena: string
  narrative: string
  attested: boolean
}

type DraftState = {
  coverage: CoverageForm
  claim: ClaimForm
}

const emptyCoverage: CoverageForm = {
  coverage_class: 'bundle',
  asset_label: '',
  replacement_value_dena: '',
  deductible_dena: '',
  stewardship_notes: '',
  attested: false,
}

const emptyClaim: ClaimForm = {
  incident_date: '',
  incident_type: 'property_damage',
  requested_reserve_dena: '',
  narrative: '',
  attested: false,
}

function readDraft(): DraftState | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PROPERTY_CASUALTY_DRAFT_KEY) || 'null') as Partial<DraftState> | null
    if (!parsed) return null
    return {
      coverage: { ...emptyCoverage, ...parsed.coverage },
      claim: { ...emptyClaim, ...parsed.claim },
    }
  } catch {
    return null
  }
}

function writeDraft(draft: DraftState) {
  sessionStorage.setItem(PROPERTY_CASUALTY_DRAFT_KEY, JSON.stringify(draft))
}

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function coverageClassLabel(value: CoverageClass) {
  if (value === 'property') return 'Property insurance'
  if (value === 'casualty') return 'Casualty insurance'
  return 'Property and casualty bundle'
}

function incidentTypeLabel(value: IncidentType) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function reserveMultiplier(coverageClass: CoverageClass, incidentType: IncidentType) {
  const classWeight = coverageClass === 'bundle' ? 0.68 : coverageClass === 'property' ? 0.72 : 0.46
  const incidentWeight = incidentType === 'property_damage'
    ? 1
    : incidentType === 'vehicle'
      ? 0.82
      : incidentType === 'business_interruption'
        ? 0.58
        : 0.4
  return classWeight * incidentWeight
}

export function PropertyCasualtyInsurancePage() {
  const [coverage, setCoverage] = useState<CoverageForm>(emptyCoverage)
  const [claim, setClaim] = useState<ClaimForm>(emptyClaim)
  const [status, setStatus] = useState('')
  const [claimStatus, setClaimStatus] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    document.title = 'Org Portal • Property and Casualty Insurance'
    const draft = readDraft()
    if (draft) {
      setCoverage(draft.coverage)
      setClaim(draft.claim)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    writeDraft({ coverage, claim })
  }, [claim, coverage, hydrated])

  const replacementValue = numberValue(coverage.replacement_value_dena)
  const deductible = numberValue(coverage.deductible_dena)
  const requestedReserve = numberValue(claim.requested_reserve_dena)

  const administrationPreview = useMemo(() => {
    const baseReserve = Math.max(0, replacementValue * reserveMultiplier(coverage.coverage_class, claim.incident_type) - deductible)
    const reserve = requestedReserve > 0 ? Math.max(0, Math.min(requestedReserve, replacementValue || requestedReserve) - deductible) : baseReserve
    return {
      reserve,
      deductible,
      ceiling: Math.max(0, replacementValue - deductible),
    }
  }, [claim.incident_type, coverage.coverage_class, deductible, replacementValue, requestedReserve])

  function saveCoverage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('Coverage intake saved. This DENNA-administered record can now anchor underwriting, reserve review, and claim decisions.')
  }

  function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setClaimStatus(`Claim intake staged. Administrative review can reserve up to ${formatDena(administrationPreview.reserve)} from the DENNA system.`)
  }

  return (
    <main className="property-casualty-page">
      <section className="portal-hero property-casualty-hero">
        <div>
          <span className="portal-pill">DENNA-administered insurance</span>
          <h1>Property and casualty insurance</h1>
          <p>
            This program sits beside health and life insurance, but it is administered through the DENNA monetary system:
            coverage intake, reserve setting, deductibles, and claim decisions are all expressed in Dena.
          </p>
        </div>
        <div className="property-casualty-summary-card" aria-label="Program administration summary">
          <strong>Administrative frame</strong>
          <span>Underwriting reference: declared replacement value and stewardship notes.</span>
          <span>Claim reserve reference: deductible-adjusted Dena reserve ceiling.</span>
          <span>Settlement reference: approved reserve movement through the DENNA ledger.</span>
        </div>
      </section>

      {status ? <div className="property-casualty-alert" role="status">{status}</div> : null}
      {claimStatus ? <div className="property-casualty-alert" role="status">{claimStatus}</div> : null}

      <section className="property-casualty-grid">
        <form className="portal-card portal-form property-casualty-card" onSubmit={saveCoverage}>
          <span className="property-casualty-eyebrow">Step 1</span>
          <h2>Coverage intake</h2>
          <p>Record the asset, exposure, and deductible in Dena so the portal can administer property and casualty cases consistently.</p>
          <label>
            Coverage class
            <select
              value={coverage.coverage_class}
              onChange={(event) => setCoverage({ ...coverage, coverage_class: event.target.value as CoverageClass })}
            >
              <option value="bundle">Property and casualty bundle</option>
              <option value="property">Property insurance only</option>
              <option value="casualty">Casualty insurance only</option>
            </select>
          </label>
          <label>
            Covered asset or operation
            <input
              value={coverage.asset_label}
              onChange={(event) => setCoverage({ ...coverage, asset_label: event.target.value })}
              placeholder="Warehouse A, delivery van, studio equipment, public event operations"
              required
            />
          </label>
          <div className="property-casualty-fields">
            <label>
              Replacement value (DEM)
              <input
                type="number"
                min="0"
                step="0.01"
                value={coverage.replacement_value_dena}
                onChange={(event) => setCoverage({ ...coverage, replacement_value_dena: event.target.value })}
                required
              />
            </label>
            <label>
              Deductible (DEM)
              <input
                type="number"
                min="0"
                step="0.01"
                value={coverage.deductible_dena}
                onChange={(event) => setCoverage({ ...coverage, deductible_dena: event.target.value })}
                required
              />
            </label>
          </div>
          <label>
            Stewardship and risk controls
            <textarea
              value={coverage.stewardship_notes}
              onChange={(event) => setCoverage({ ...coverage, stewardship_notes: event.target.value })}
              placeholder="Fire suppression, secure storage, driving protocol, venue marshals, contractor controls"
              rows={5}
              required
            />
          </label>
          <label className="property-casualty-check">
            <input
              type="checkbox"
              checked={coverage.attested}
              onChange={(event) => setCoverage({ ...coverage, attested: event.target.checked })}
              required
            />
            <span>I attest that this coverage record should be administered in Dena within the DENNA system.</span>
          </label>
          <button type="submit">Save coverage intake</button>
        </form>

        <section className="portal-card property-casualty-card property-casualty-preview" aria-live="polite">
          <span className="property-casualty-eyebrow">Administration</span>
          <h2>Dena reserve preview</h2>
          <strong className="property-casualty-amount">{formatDena(administrationPreview.reserve)}</strong>
          <div className="property-casualty-stats">
            <div><span>Coverage class</span><strong>{coverageClassLabel(coverage.coverage_class)}</strong></div>
            <div><span>Deductible</span><strong>{formatDena(administrationPreview.deductible)}</strong></div>
            <div><span>Maximum reserve ceiling</span><strong>{formatDena(administrationPreview.ceiling)}</strong></div>
          </div>
          <p>
            The portal uses declared value minus deductible as the governing ceiling, then scales the reserve by incident class so
            administrators can keep DENNA commitments conservative until review is complete.
          </p>
        </section>
      </section>

      <section className="property-casualty-grid">
        <form className="portal-card portal-form property-casualty-card" onSubmit={submitClaim}>
          <span className="property-casualty-eyebrow">Step 2</span>
          <h2>Claim intake</h2>
          <p>Claims follow the same portal pattern as other insurance programs: structured intake, attestation, then administrative action.</p>
          <label>
            Incident date
            <input
              type="date"
              value={claim.incident_date}
              onChange={(event) => setClaim({ ...claim, incident_date: event.target.value })}
              required
            />
          </label>
          <label>
            Incident type
            <select
              value={claim.incident_type}
              onChange={(event) => setClaim({ ...claim, incident_type: event.target.value as IncidentType })}
            >
              <option value="property_damage">Property damage</option>
              <option value="liability">Liability</option>
              <option value="vehicle">Vehicle</option>
              <option value="business_interruption">Business interruption</option>
            </select>
          </label>
          <label>
            Requested reserve (DEM)
            <input
              type="number"
              min="0"
              step="0.01"
              value={claim.requested_reserve_dena}
              onChange={(event) => setClaim({ ...claim, requested_reserve_dena: event.target.value })}
              placeholder="Leave blank to use the administrative reference amount"
            />
          </label>
          <label>
            Incident narrative
            <textarea
              value={claim.narrative}
              onChange={(event) => setClaim({ ...claim, narrative: event.target.value })}
              placeholder="Describe the loss, who was affected, immediate controls taken, and what should be funded next."
              rows={6}
              required
            />
          </label>
          <label className="property-casualty-check">
            <input
              type="checkbox"
              checked={claim.attested}
              onChange={(event) => setClaim({ ...claim, attested: event.target.checked })}
              required
            />
            <span>I attest that this claim intake is ready for DENNA reserve review.</span>
          </label>
          <button type="submit">Stage claim intake</button>
        </form>

        <section className="portal-card property-casualty-card property-casualty-reference">
          <span className="property-casualty-eyebrow">Reference</span>
          <h2>How this is administered</h2>
          <div className="property-casualty-reference-list">
            <article>
              <strong>1. Coverage record</strong>
              <p>The member declares the covered asset or operation, replacement value, and deductible in Dena.</p>
            </article>
            <article>
              <strong>2. Reserve review</strong>
              <p>The portal computes a conservative Dena reserve so administrators can approve, narrow, or defer the claim.</p>
            </article>
            <article>
              <strong>3. DENNA settlement</strong>
              <p>When approved, the reserve becomes a ledger movement inside the DENNA monetary system rather than an off-platform promise.</p>
            </article>
            <article>
              <strong>4. Casualty discipline</strong>
              <p>Liability and interruption cases stay bounded by declared ceilings, deductibles, and narrative evidence before release.</p>
            </article>
          </div>
          <div className="property-casualty-reference-note">
            <span>Current incident class</span>
            <strong>{incidentTypeLabel(claim.incident_type)}</strong>
          </div>
        </section>
      </section>
    </main>
  )
}
