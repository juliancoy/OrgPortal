import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { pidpUrl } from '../../../config/pidp'
import { resolveSignedS3UploadUrl } from '../../../infrastructure/auth/avatarUpload'

const ORG_API_BASE = '/api/org'
const USER_PROFILE_STORAGE_KEY = 'user.profile'
const LEGACY_USER_PROFILE_STORAGE_KEY = 'constituent.profile'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

const MASLOW_NEEDS = [
  { key: 'physiological', label: 'Physiological' },
  { key: 'safety', label: 'Safety' },
  { key: 'love_belonging', label: 'Love & Belonging' },
  { key: 'esteem', label: 'Esteem' },
  { key: 'self_actualization', label: 'Self-Actualization' },
] as const

type MaslowNeedKey = (typeof MASLOW_NEEDS)[number]['key']
type MaslowRatings = Record<MaslowNeedKey, number>

const DEFAULT_MASLOW_RATINGS: MaslowRatings = {
  physiological: 3,
  safety: 3,
  love_belonging: 3,
  esteem: 3,
  self_actualization: 3,
}

function normalizeMaslowRatings(value: unknown): MaslowRatings {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const normalized: MaslowRatings = { ...DEFAULT_MASLOW_RATINGS }
  for (const need of MASLOW_NEEDS) {
    const raw = Number(source[need.key])
    if (Number.isFinite(raw)) {
      normalized[need.key] = Math.max(1, Math.min(5, Math.round(raw)))
    }
  }
  return normalized
}

type ProfileDraft = {
  fullName: string
  firstName: string
  lastName: string
  displayName: string
  bio: string
  avatarUrl: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  zip: string
  organizations: string
  maslowNow: MaslowRatings
  maslowFuture: MaslowRatings
}

type UserOrganization = {
  id: string
  name: string
  slug: string
  my_role?: 'member' | 'admin' | string | null
  claimed_by_user_id?: string | null
  is_contested?: boolean
  pending_claim_requests_count?: number
}

export function UserProfilePage() {
  const { user, setUser, token, logout } = useAuth()
  const [fullName, setFullName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [displayName, setDisplayName] = useState(user?.displayName ?? 'Demo User')
  const [bio, setBio] = useState('Interested in local policy and civic engagement.')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [organizations, setOrganizations] = useState('')
  const [isRunningForOffice, setIsRunningForOffice] = useState(false)
  const [officeTitle, setOfficeTitle] = useState('')
  const [campaignStatement, setCampaignStatement] = useState('')
  const [maslowNow, setMaslowNow] = useState<MaslowRatings>(DEFAULT_MASLOW_RATINGS)
  const [maslowFuture, setMaslowFuture] = useState<MaslowRatings>(DEFAULT_MASLOW_RATINGS)
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([])
  const [userOrganizationsStatus, setUserOrganizationsStatus] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorSource, setEditorSource] = useState<string | null>(null)
  const [editorImage, setEditorImage] = useState<HTMLImageElement | null>(null)
  const [editorZoom, setEditorZoom] = useState(1)
  const [editorRotate, setEditorRotate] = useState(0)
  const [editorOffsetX, setEditorOffsetX] = useState(0)
  const [editorOffsetY, setEditorOffsetY] = useState(0)
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const editorObjectUrl = useRef<string | null>(null)

  useEffect(() => {
    document.title = 'Org Portal • User profile'
  }, [])

  useEffect(() => {
    let cancelled = false

    async function hydrateFromPidp() {
      try {
        const resp = await fetch(pidpUrl('/auth/me'), {
          credentials: 'include',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (!resp.ok) return
        const data = await resp.json()
        if (cancelled) return

        if (data.full_name) setFullName(data.full_name)
        if (data.identity_data?.display_name) setDisplayName(data.identity_data.display_name)
        if (data.identity_data?.bio) setBio(data.identity_data.bio)
        if (data.identity_data?.avatar_url) setAvatarUrl(data.identity_data.avatar_url)
        if (data.identity_data?.first_name) setFirstName(data.identity_data.first_name)
        if (data.identity_data?.last_name) setLastName(data.identity_data.last_name)
        if (data.identity_data?.address_line1) setAddressLine1(data.identity_data.address_line1)
        if (data.identity_data?.address_line2) setAddressLine2(data.identity_data.address_line2)
        if (data.identity_data?.city) setCity(data.identity_data.city)
        if (data.identity_data?.state) setState(data.identity_data.state)
        if (data.identity_data?.zip) setZip(data.identity_data.zip)
        if (data.identity_data?.organizations) {
          const orgs = Array.isArray(data.identity_data.organizations)
            ? data.identity_data.organizations.join(', ')
            : data.identity_data.organizations
          setOrganizations(orgs)
        }
        if (data.identity_data?.is_running_for_office) setIsRunningForOffice(true)
        if (data.identity_data?.office_title) setOfficeTitle(data.identity_data.office_title)
        if (data.identity_data?.campaign_statement) setCampaignStatement(data.identity_data.campaign_statement)
        if (data.identity_data?.maslow_now) setMaslowNow(normalizeMaslowRatings(data.identity_data.maslow_now))
        if (data.identity_data?.maslow_future) setMaslowFuture(normalizeMaslowRatings(data.identity_data.maslow_future))
      } catch {
        // ignore
      }
    }

    if (token) {
      hydrateFromPidp()
      return () => {
        cancelled = true
      }
    }

    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY) || localStorage.getItem(LEGACY_USER_PROFILE_STORAGE_KEY)
    if (!raw) return () => {
      cancelled = true
    }
    try {
      const saved = JSON.parse(raw) as Partial<ProfileDraft>
      if (saved.fullName) setFullName(saved.fullName)
      if (saved.firstName) setFirstName(saved.firstName)
      if (saved.lastName) setLastName(saved.lastName)
      if (saved.displayName) setDisplayName(saved.displayName)
      if (saved.bio) setBio(saved.bio)
      if (saved.avatarUrl) setAvatarUrl(saved.avatarUrl)
      if (saved.addressLine1) setAddressLine1(saved.addressLine1)
      if (saved.addressLine2) setAddressLine2(saved.addressLine2)
      if (saved.city) setCity(saved.city)
      if (saved.state) setState(saved.state)
      if (saved.zip) setZip(saved.zip)
      if (saved.organizations) setOrganizations(saved.organizations)
      if (saved.maslowNow) setMaslowNow(normalizeMaslowRatings(saved.maslowNow))
      if (saved.maslowFuture) setMaslowFuture(normalizeMaslowRatings(saved.maslowFuture))
    } catch {
      // Ignore malformed local data.
    }

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setUserOrganizations([])
      setUserOrganizationsStatus('Sign in to load your organizations.')
      return () => {
        cancelled = true
      }
    }

    setUserOrganizationsStatus('Loading your organizations…')
    fetch(orgUrl('/api/network/orgs?mine=true&limit=300'), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load organizations (${resp.status})`)
        }
        return resp.json() as Promise<UserOrganization[]>
      })
      .then((rows) => {
        if (cancelled) return
        const list = (Array.isArray(rows) ? rows : []) as UserOrganization[]
        return Promise.all(
          list.map(async (org) => {
            try {
              const resp = await fetch(orgUrl(`/api/network/orgs/public/${encodeURIComponent(org.slug)}`))
              if (!resp.ok) return org
              const publicOrg = (await resp.json()) as {
                is_contested?: boolean
                pending_claim_requests_count?: number
              }
              return {
                ...org,
                is_contested: Boolean(publicOrg.is_contested),
                pending_claim_requests_count: Number(publicOrg.pending_claim_requests_count || 0),
              }
            } catch {
              return org
            }
          }),
        )
      })
      .then((rows) => {
        if (cancelled) return
        const list = Array.isArray(rows) ? rows : []
        list.sort((a, b) => {
          const aAdmin = a.my_role === 'admin' ? 1 : 0
          const bAdmin = b.my_role === 'admin' ? 1 : 0
          if (aAdmin !== bAdmin) return bAdmin - aAdmin
          return (a.name || '').localeCompare(b.name || '')
        })
        setUserOrganizations(list)
        setUserOrganizationsStatus('')
      })
      .catch((err) => {
        if (cancelled) return
        setUserOrganizations([])
        setUserOrganizationsStatus(err instanceof Error ? err.message : 'Failed to load your organizations')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (status) setStatus(null)
  }, [fullName, firstName, lastName, displayName, bio, avatarUrl, addressLine1, addressLine2, city, state, zip, organizations, isRunningForOffice, officeTitle, campaignStatement, maslowNow, maslowFuture])

  useEffect(() => {
    if (!editorSource) {
      setEditorImage(null)
      return
    }
    const img = new Image()
    img.onload = () => setEditorImage(img)
    img.src = editorSource
  }, [editorSource])

  useEffect(() => {
    const canvas = editorCanvasRef.current
    if (!canvas || !editorImage) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const size = 320
    canvas.width = size
    canvas.height = size
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#f4f1e4'
    ctx.fillRect(0, 0, size, size)

    const baseScale = Math.max(size / editorImage.width, size / editorImage.height)
    const finalScale = baseScale * editorZoom

    ctx.save()
    ctx.translate(size / 2 + editorOffsetX, size / 2 + editorOffsetY)
    ctx.rotate((editorRotate * Math.PI) / 180)
    ctx.scale(finalScale, finalScale)
    ctx.drawImage(editorImage, -editorImage.width / 2, -editorImage.height / 2)
    ctx.restore()
  }, [editorImage, editorZoom, editorRotate, editorOffsetX, editorOffsetY])

  useEffect(() => {
    return () => {
      if (editorObjectUrl.current) {
        URL.revokeObjectURL(editorObjectUrl.current)
        editorObjectUrl.current = null
      }
    }
  }, [])

  return (
    <section className="panel">
      <h1 style={{ marginTop: 0 }}>Public profile (user)</h1>
      {user?.id ? (
        <div className="portal-card" style={{ padding: '0.65rem', marginBottom: '0.75rem', display: 'grid', gap: '0.25rem' }}>
          <div className="muted" style={{ margin: 0 }}>User UUID</div>
          <code style={{ wordBreak: 'break-all' }}>{user.id}</code>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label className="muted" htmlFor="first-name">
              First name
            </label>
            <input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="muted" htmlFor="last-name">
              Last name
            </label>
            <input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label className="muted" htmlFor="full-name">
            Full name (public record)
          </label>
          <input
            id="full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Auto-filled from first + last name"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="muted" htmlFor="dn">
            Display name
          </label>
          <input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="muted">Profile photo</label>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '96px',
                height: '96px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '1px solid #d8d2c3',
                background: '#f4f1e4',
                display: 'grid',
                placeItems: 'center',
                color: '#6c675d',
                fontSize: '0.9rem',
              }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span>No photo</span>
              )}
            </div>
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  if (!file) return
                  if (editorObjectUrl.current) {
                    URL.revokeObjectURL(editorObjectUrl.current)
                  }
                  const url = URL.createObjectURL(file)
                  editorObjectUrl.current = url
                  setEditorSource(url)
                  setEditorZoom(1)
                  setEditorRotate(0)
                  setEditorOffsetX(0)
                  setEditorOffsetY(0)
                  setEditorOpen(true)
                  event.currentTarget.value = ''
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {avatarUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditorSource(avatarUrl)
                      setEditorZoom(1)
                      setEditorRotate(0)
                      setEditorOffsetX(0)
                      setEditorOffsetY(0)
                      setEditorOpen(true)
                    }}
                  >
                    Edit photo
                  </button>
                ) : null}
                {avatarUrl ? (
                  <button type="button" onClick={() => setAvatarUrl('')}>
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Upload a photo and crop/rotate it before saving.
              </p>
            </div>
          </div>
        </div>
        <div>
          <label className="muted" htmlFor="bio">
            Bio
          </label>
          <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="muted" htmlFor="address-line-1">
            Address line 1
          </label>
          <input id="address-line-1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} style={{ width: '100%' }} />
        </div>
        <p className="muted" style={{ marginTop: '-0.25rem', marginBottom: 0 }}>
          Address is required for petition signatures to be recognized by your state.
        </p>
        <div>
          <label className="muted" htmlFor="address-line-2">
            Address line 2
          </label>
          <input id="address-line-2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: '2fr 1fr 1fr' }}>
          <div>
            <label className="muted" htmlFor="city">
              City
            </label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="muted" htmlFor="state">
              State
            </label>
            <input id="state" value={state} onChange={(e) => setState(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="muted" htmlFor="zip">
              ZIP
            </label>
            <input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label className="muted" htmlFor="orgs">
            Organizations (comma-separated)
          </label>
          <input id="orgs" value={organizations} onChange={(e) => setOrganizations(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="portal-card" style={{ display: 'grid', gap: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Maslow Satisfaction</h2>
          <p className="muted" style={{ margin: 0 }}>
            Rate each need from 1 (low) to 5 (high) for now and for your future outlook.
          </p>
          <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Now</h3>
              {MASLOW_NEEDS.map((need) => (
                <label key={`maslow-now-${need.key}`} style={{ display: 'grid', gap: '0.25rem' }}>
                  <span className="muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{need.label}</span>
                    <strong>{maslowNow[need.key]}</strong>
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={maslowNow[need.key]}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setMaslowNow((current) => ({ ...current, [need.key]: next }))
                    }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Future</h3>
              {MASLOW_NEEDS.map((need) => (
                <label key={`maslow-future-${need.key}`} style={{ display: 'grid', gap: '0.25rem' }}>
                  <span className="muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{need.label}</span>
                    <strong>{maslowFuture[need.key]}</strong>
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={maslowFuture[need.key]}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setMaslowFuture((current) => ({ ...current, [need.key]: next }))
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="portal-card" style={{ display: 'grid', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Your Organizations</h2>
          {userOrganizationsStatus ? (
            <p className="muted" style={{ margin: 0 }}>
              {userOrganizationsStatus}
            </p>
          ) : null}
          {!userOrganizationsStatus && userOrganizations.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              You are not a member/admin of any organizations yet.
            </p>
          ) : null}
          {userOrganizations.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.35rem' }}>
              {userOrganizations.map((org) => (
                <li key={org.id}>
                  <Link to={`/orgs/${encodeURIComponent(org.slug)}`}>{org.name}</Link>{' '}
                  <span className="muted">
                    (
                    {org.claimed_by_user_id && user?.id && org.claimed_by_user_id === user.id
                      ? 'owner'
                      : org.my_role || 'member'}
                    )
                  </span>
                  {org.is_contested ? (
                    <span className="muted"> • contested ({org.pending_claim_requests_count || 0})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div style={{ borderTop: '1px solid rgba(12, 30, 60, 0.12)', paddingTop: '1rem', marginTop: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isRunningForOffice}
              onChange={(e) => setIsRunningForOffice(e.target.checked)}
            />
            <span style={{ fontWeight: 600 }}>I&apos;m running for office</span>
          </label>
          {isRunningForOffice ? (
            <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.6rem' }}>
              <div>
                <label className="muted" htmlFor="office-title">
                  Office / position
                </label>
                <input
                  id="office-title"
                  value={officeTitle}
                  onChange={(e) => setOfficeTitle(e.target.value)}
                  placeholder="e.g. City Council District 4"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label className="muted" htmlFor="campaign-statement">
                  Campaign statement
                </label>
                <textarea
                  id="campaign-statement"
                  value={campaignStatement}
                  onChange={(e) => setCampaignStatement(e.target.value)}
                  rows={4}
                  placeholder="Tell voters about your platform and goals"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          ) : null}
        </div>
        {status ? (
          <p className="muted" role="status" style={{ marginBottom: 0 }}>
            {status}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const combinedName = `${firstName.trim()} ${lastName.trim()}`.trim()
            const payload: ProfileDraft = {
              fullName: (fullName.trim() || combinedName).trim(),
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              displayName: displayName.trim() || 'Anonymous',
              bio,
              avatarUrl,
              addressLine1,
              addressLine2,
              city,
              state,
              zip,
              organizations,
              maslowNow,
              maslowFuture,
            }
            const organizationsList = payload.organizations
              .split(',')
              .map((org) => org.trim())
              .filter(Boolean)

            if (token) {
              fetch(pidpUrl('/auth/me'), {
                method: 'PUT',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  full_name: payload.fullName || null,
                  display_name: payload.displayName,
                  bio: payload.bio,
                  avatar_url: payload.avatarUrl || null,
                  first_name: payload.firstName || null,
                  last_name: payload.lastName || null,
                  address_line1: payload.addressLine1,
                  address_line2: payload.addressLine2,
                  city: payload.city,
                  state: payload.state,
                  zip: payload.zip,
                  organizations: organizationsList,
                  maslow_now: maslowNow,
                  maslow_future: maslowFuture,
                  is_running_for_office: isRunningForOffice,
                  office_title: isRunningForOffice ? officeTitle : null,
                  campaign_statement: isRunningForOffice ? campaignStatement : null,
                }),
              })
                .then(async (resp) => {
                  if (!resp.ok) {
                    const text = await resp.text().catch(() => '')
                    throw new Error(text || `Save failed (${resp.status})`)
                  }
                  return resp.json()
                })
                .then((data) => {
                  setStatus('Profile saved.')
                  if (user) {
                    const newDisplay = payload.displayName || user.displayName
                    setUser({
                      ...user,
                      displayName: newDisplay,
                      fullName: data.full_name ?? user.fullName,
                      firstName: payload.firstName,
                      lastName: payload.lastName,
                      avatarUrl: payload.avatarUrl || user.avatarUrl,
                    })
                  }
                })
                .catch((err) => {
                  setStatus(err instanceof Error ? err.message : 'Profile save failed.')
                })
              return
            }

            localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(payload))
            setStatus('Profile saved.')
            if (user) {
              setUser({
                ...user,
                displayName: payload.displayName,
                fullName: payload.fullName,
                firstName: payload.firstName,
                lastName: payload.lastName,
                avatarUrl: payload.avatarUrl,
              })
            }
          }}
        >
          Save profile
        </button>
      </div>
      {editorOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20, 16, 8, 0.55)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
            padding: '1rem',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '1.5rem',
              borderRadius: '16px',
              width: 'min(92vw, 720px)',
              boxShadow: '0 24px 60px rgba(18, 14, 6, 0.3)',
              display: 'grid',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <h2 style={{ margin: 0 }}>Edit profile photo</h2>
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false)
                  setEditorSource(null)
                  setEditorImage(null)
                  setEditorError(null)
                }}
              >
                Close
              </button>
            </div>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div style={{ display: 'grid', placeItems: 'center', background: '#f7f3e9', borderRadius: '16px', padding: '1rem' }}>
                <canvas
                  ref={editorCanvasRef}
                  style={{
                    width: 'min(320px, 70vw)',
                    height: 'min(320px, 70vw)',
                    borderRadius: '16px',
                  }}
                />
              </div>
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span className="muted">Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={editorZoom}
                    onChange={(e) => setEditorZoom(Number(e.target.value))}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span className="muted">Horizontal position</span>
                  <input
                    type="range"
                    min={-120}
                    max={120}
                    step={1}
                    value={editorOffsetX}
                    onChange={(e) => setEditorOffsetX(Number(e.target.value))}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span className="muted">Vertical position</span>
                  <input
                    type="range"
                    min={-120}
                    max={120}
                    step={1}
                    value={editorOffsetY}
                    onChange={(e) => setEditorOffsetY(Number(e.target.value))}
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setEditorRotate((val) => val - 90)}>
                    Rotate left
                  </button>
                  <button type="button" onClick={() => setEditorRotate((val) => val + 90)}>
                    Rotate right
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditorZoom(1)
                      setEditorRotate(0)
                      setEditorOffsetX(0)
                      setEditorOffsetY(0)
                    }}
                  >
                    Reset
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const canvas = editorCanvasRef.current
                      if (!canvas) return
                      setEditorBusy(true)
                      setEditorError(null)
                      canvas.toBlob(async (blob) => {
                        if (!blob) {
                          setEditorBusy(false)
                          setEditorError('Could not read image data.')
                          return
                        }
                        try {
                          if (token) {
                            const resp = await fetch(pidpUrl('/auth/avatar/upload-url'), {
                              method: 'POST',
                              credentials: 'include',
                            })
                            if (!resp.ok) {
                              if (resp.status === 401) {
                                logout()
                                throw new Error('Session expired. Please log in again to upload a photo.')
                              }
                              const text = await resp.text().catch(() => '')
                              throw new Error(text || `Upload setup failed (${resp.status})`)
                            }
                            const data = await resp.json()
                            const uploadResp = await fetch(resolveSignedS3UploadUrl(data.upload_url), {
                              method: 'PUT',
                              headers: { 'Content-Type': 'image/png' },
                              body: blob,
                            })
                            if (!uploadResp.ok) {
                              throw new Error(`Upload failed (${uploadResp.status})`)
                            }
                            setAvatarUrl(data.public_url)
                            setStatus('Photo uploaded. Save profile to publish.')
                          } else {
                            setAvatarUrl(canvas.toDataURL('image/png'))
                          }
                          setEditorOpen(false)
                          setEditorSource(null)
                          setEditorImage(null)
                          if (editorObjectUrl.current) {
                            URL.revokeObjectURL(editorObjectUrl.current)
                            editorObjectUrl.current = null
                          }
                        } catch (err) {
                          setEditorError(err instanceof Error ? err.message : 'Upload failed.')
                        } finally {
                          setEditorBusy(false)
                        }
                      }, 'image/png')
                    }}
                  >
                    {editorBusy ? 'Uploading…' : 'Apply photo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditorOpen(false)
                      setEditorSource(null)
                      setEditorImage(null)
                      setEditorError(null)
                      if (editorObjectUrl.current) {
                        URL.revokeObjectURL(editorObjectUrl.current)
                        editorObjectUrl.current = null
                      }
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {editorError ? (
                  <p className="muted" style={{ color: '#a61f1f', margin: 0 }}>
                    {editorError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
