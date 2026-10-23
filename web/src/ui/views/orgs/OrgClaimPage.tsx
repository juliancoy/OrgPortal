import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { loadPublicOrganization } from '../../../data/publicOrganization/organizations'
import { invalidatePublicOrganizationData } from '../../../data/publicOrganization/cache'
import { toUserFacingErrorMessage } from '../../../infrastructure/http/userFacingError'
import { SignInLink } from '../../components/SignInLink'

type ClaimOrganization = { id: string; name: string; slug: string; claimed_by_user_id?: string | null }

export function OrgClaimPage() {
  const { handle } = useParams()
  const { token, isLoading } = useAuth()
  const [organization, setOrganization] = useState<ClaimOrganization | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Claim this Org'
    const controller = new AbortController()
    setOrganization(null); setCanManage(false); setExplanation(''); setError(''); setSuccess('')
    if (!handle || isLoading) return () => controller.abort()
    async function load() {
      const org = await loadPublicOrganization<ClaimOrganization>(handle!, { signal: controller.signal, force: true })
      let manages = false
      if (token) {
        const response = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(org.id)}/membership`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
        })
        if (!response.ok) throw new Error('Could not check your organization access. Please reload to try again.')
        const membership = await response.json()
        manages = membership.status === 'active' && ['owner', 'administrator'].includes(membership.role)
      }
      if (!controller.signal.aborted) { setOrganization(org); setCanManage(manages) }
    }
    void load().catch(reason => { if (!controller.signal.aborted) setError(toUserFacingErrorMessage(reason, 'Could not load this organization.')) })
    return () => controller.abort()
  }, [handle, token, isLoading])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organization || !token || canManage || busy || success) return
    const owned = Boolean(organization.claimed_by_user_id)
    if (owned && !explanation.trim()) { setError('Explain why you should manage this organization.'); return }
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organization.id)}/${owned ? 'ownership-challenges' : 'claim'}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(owned ? { body: JSON.stringify({ explanation: explanation.trim() }) } : {}),
      })
      if (!response.ok) {
        if (response.status === 409 && !owned) {
          setOrganization(await loadPublicOrganization<ClaimOrganization>(organization.slug, { force: true }))
          throw new Error('This organization was just claimed. Review the updated form to submit your request.')
        }
        const data = await response.json().catch(() => null)
        throw new Error(data?.detail || data?.error || `Could not submit your claim (${response.status}).`)
      }
      setSuccess(owned ? 'Your claim has been submitted for review. Existing ownership remains in place while it is reviewed.' : 'Organization claimed. You are now its owner and can manage its profile, members, and events.')
      setExplanation('')
      await invalidatePublicOrganizationData()
      window.dispatchEvent(new Event('organization-access-change'))
    } catch (reason) { setError(toUserFacingErrorMessage(reason, 'Could not submit your claim.')) }
    finally { setBusy(false) }
  }

  return <section className="panel" style={{ maxWidth: 720, marginInline: 'auto' }}>
    <Link to={`/orgs/${encodeURIComponent(organization?.slug || handle || '')}`}>← Back to organization</Link>
    <h1>Claim this Org</h1>
    {organization ? <>
      <h2>{organization.name}</h2>
      {success ? <p role="status">{success}</p> : isLoading ? <p role="status">Checking sign-in…</p> : !token ? <p><SignInLink /> to claim this organization.</p> : canManage ? <p>You already manage this organization. <Link to={`/orgs/${encodeURIComponent(organization.slug)}/dashboard`}>Open dashboard</Link></p> : <form onSubmit={event => void submit(event)} style={{ display: 'grid', gap: '1rem' }}>
        {organization.claimed_by_user_id ? <>
          <p>This organization already has an owner. Explain your connection and why you should manage it. Your request will be reviewed before ownership can change.</p>
          <label htmlFor="org-claim-explanation">Why should you manage this organization?</label>
          <textarea id="org-claim-explanation" required maxLength={4000} rows={6} value={explanation} onChange={event => setExplanation(event.target.value)} disabled={busy} style={{ width: '100%', boxSizing: 'border-box' }} />
        </> : <p>Claim this organization to become its owner and manage its profile, members, and events.</p>}
        <button className="btn-primary" type="submit" disabled={busy} style={{ justifySelf: 'start' }}>{busy ? 'Submitting…' : 'Claim this Org'}</button>
      </form>}
    </> : !error && <p role="status">Loading organization…</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
