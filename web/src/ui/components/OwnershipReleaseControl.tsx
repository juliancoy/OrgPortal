import { useState } from 'react'

type ReleaseReview = { previewId: string; expiresAt: string; effects: { otherActiveMembershipCount: number } }
export function OwnershipReleaseControl({ token, organizationId, onSaved }: { token: string | null; organizationId: string; onSaved: () => Promise<void> }) {
  const [review, setReview] = useState<ReleaseReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [status, setStatus] = useState('')
  async function release(apply: boolean) {
    if (!token || (apply && !review)) return
    setBusy(true); setStatus('')
    try {
      const response = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/ownership/release/${apply ? 'apply' : 'preview'}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'incorrect_association', ...(apply ? { confirm: true, previewId: review!.previewId } : {}) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(String(result.error || result.detail || 'Could not release ownership'))
      if (apply) {
        setReview(null); window.dispatchEvent(new Event('organization-access-change')); await onSaved()
      } else { setReview(result as ReleaseReview); setUncertain(false) }
    } catch (error) { if (apply) setUncertain(true); setStatus(error instanceof Error ? error.message : 'The result is unavailable') }
    finally { setBusy(false) }
  }
  async function inspect() {
    if (!review) return
    setBusy(true)
    try {
      const response = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/operations/${review.previewId}`, { headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || result.detail || 'Could not inspect operation')
      if (result.status === 'completed') { setReview(null); window.dispatchEvent(new Event('organization-access-change')); await onSaved() }
      else if (result.status === 'prepared' && Number(result.expires_at) > Date.now()) { setUncertain(false); setStatus('The change has not run. Review before applying.') }
      else setStatus('The result needs review. Check the public listing before starting another operation.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not inspect operation') }
    finally { setBusy(false) }
  }
  return <div>
    {!review ? <button type="button" className="btn-secondary" disabled={!token || busy} onClick={() => release(false)}>Correct mistaken ownership</button>
      : <section aria-label="Review ownership correction">
        <p>Your owner access and membership will be removed. The directory listing and its research will remain. No one else will receive ownership. Other active memberships remain unchanged ({review.effects.otherActiveMembershipCount}).</p>
        <button type="button" className="btn-secondary" disabled={busy || uncertain || Date.parse(review.expiresAt) <= Date.now()} onClick={() => release(true)}>Remove my ownership and membership</button>{' '}
        {!uncertain && <button type="button" className="btn-secondary" disabled={busy} onClick={() => setReview(null)}>Cancel</button>}
        {uncertain && <button type="button" className="btn-secondary" disabled={busy} onClick={inspect}>Check operation result</button>}
      </section>}
    {status && <p role="status">{status}</p>}
  </div>
}
