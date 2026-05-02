import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { proposeMotion } from '../../../application/usecases/proposeMotion'
import { GovernanceNav, GovernanceBreadcrumb } from '../../components/governance/GovernanceNav'
import { useGovernanceParadigm, useGovernanceRepositories } from './paradigm'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type MyOrganization = {
  id: string
  name: string
  my_role?: string | null
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 14,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--panel)',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

export function ProposeMotionPage() {
  const { motionRepository } = useGovernanceRepositories()
  const { basePath, isRoberts } = useGovernanceParadigm()
  const { user, token } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [quorumRequired, setQuorumRequired] = useState(5)
  const [proposerType, setProposerType] = useState<'user' | 'org'>('user')
  const [myAdminOrgs, setMyAdminOrgs] = useState<MyOrganization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    document.title = isRoberts ? "Org Portal \u2022 Propose Motion \u2022 Robert's Rules" : 'Org Portal \u2022 Propose Motion'
  }, [isRoberts])

  useEffect(() => {
    if (!token) {
      setMyAdminOrgs([])
      return
    }
    let cancelled = false
    fetch(orgUrl('/api/network/orgs?mine=true&limit=200'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (resp) => {
        if (!resp.ok) return []
        return (await resp.json()) as MyOrganization[]
      })
      .then((rows) => {
        if (cancelled) return
        const admins = (Array.isArray(rows) ? rows : []).filter((org) => org.my_role === 'admin')
        setMyAdminOrgs(admins)
        if (admins.length > 0 && !selectedOrgId) {
          setSelectedOrgId(admins[0].id)
        }
      })
      .catch(() => {
        if (cancelled) return
        setMyAdminOrgs([])
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) {
      setErrors(['You must be logged in to propose a motion.'])
      return
    }
    if (proposerType === 'org' && myAdminOrgs.length === 0) {
      setErrors(['You must be an admin of at least one organization to raise an organization motion.'])
      return
    }
    const selectedOrg = proposerType === 'org' ? myAdminOrgs.find((org) => org.id === selectedOrgId) : null
    if (proposerType === 'org' && !selectedOrg) {
      setErrors(['Select an organization to raise this motion.'])
      return
    }
    setErrors([])
    setSubmitting(true)
    const res = await proposeMotion(motionRepository, {
      title,
      body,
      proposerType,
      proposerId: user.id,
      proposerName: proposerType === 'org' ? (selectedOrg?.name || user.displayName) : user.displayName,
      proposerUserName: proposerType === 'org' ? user.displayName : undefined,
      proposerOrgId: proposerType === 'org' ? selectedOrg?.id : undefined,
      proposerOrgName: proposerType === 'org' ? selectedOrg?.name : undefined,
      quorumRequired,
    })
    setSubmitting(false)
    if (res.ok) {
      navigate(`${basePath}/${res.motion.id}`)
    } else {
      setErrors(res.errors)
    }
  }

  return (
    <div>
      <GovernanceNav />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 40px' }}>
        <GovernanceBreadcrumb items={[{ label: 'Motions', to: basePath }, { label: 'Propose Motion' }]} />

      <div style={{
        background: 'var(--panel)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        padding: 32,
      }}>
        <h1 style={{
          fontSize: 24,
          fontWeight: 800,
          margin: '0 0 24px',
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}>
          Propose a Motion
        </h1>

        {errors.length > 0 && (
          <div style={{
            marginBottom: 20,
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--accent-red-bg)',
            border: '1px solid var(--accent-red)',
          }}>
            {errors.map((err, i) => (
              <p key={i} style={{ color: 'var(--accent-red)', fontSize: 14, margin: i > 0 ? '4px 0 0' : 0, fontWeight: 500 }}>{err}</p>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label
                htmlFor="motion-proposer-type"
                style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                Raise As
              </label>
              <select
                id="motion-proposer-type"
                value={proposerType}
                onChange={(e) => setProposerType(e.target.value as 'user' | 'org')}
                style={{ ...inputStyle, maxWidth: 320 }}
              >
                <option value="user">User ({user?.displayName || 'signed in user'})</option>
                <option value="org" disabled={myAdminOrgs.length === 0}>
                  Organization {myAdminOrgs.length === 0 ? '(no admin orgs available)' : ''}
                </option>
              </select>
              {proposerType === 'org' ? (
                <div style={{ marginTop: 10 }}>
                  <label
                    htmlFor="motion-proposer-org"
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Organization
                  </label>
                  <select
                    id="motion-proposer-org"
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    style={{ ...inputStyle, maxWidth: 420 }}
                  >
                    {myAdminOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                    This motion will be displayed as raised by the selected organization.
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="motion-title"
                style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                Title
              </label>
              <input
                id="motion-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a clear, descriptive title"
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label
                htmlFor="motion-body"
                style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                Body
              </label>
              <textarea
                id="motion-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Describe the motion in detail..."
                style={{ ...inputStyle, resize: 'vertical' }}
                required
              />
            </div>

            <div>
              <label
                htmlFor="motion-quorum"
                style={{
                  display: 'block',
                  marginBottom: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                Quorum Required
              </label>
              <input
                id="motion-quorum"
                type="number"
                min={1}
                value={quorumRequired}
                onChange={(e) => setQuorumRequired(Number(e.target.value))}
                style={{ ...inputStyle, width: 140 }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 999,
                padding: '14px 24px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: 15,
                opacity: submitting ? 0.6 : 1,
                transition: 'opacity 0.15s, background 0.15s',
                marginTop: 4,
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Motion'}
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  )
}
