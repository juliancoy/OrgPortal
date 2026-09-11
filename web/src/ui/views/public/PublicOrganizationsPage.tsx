import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { setSeoMeta, upsertJsonLd } from '../../utils/seo'
import { useAuth } from '../../../app/AppProviders'
import { pidpAppLoginUrl } from '../../../config/pidp'
import { OrgImage } from '../../components/media/OrgImage'

const ORG_API_BASE = '/api/org'

function orgUrl(path: string) {
  if (!path.startsWith('/')) return `${ORG_API_BASE}/${path}`
  return `${ORG_API_BASE}${path}`
}

type PublicOrganizationListItem = {
  id: string
  name: string
  slug: string
  description?: string | null
  source_url?: string | null
  source_urls?: string[]
  image_url?: string | null
  tags?: string[]
  membership_count: number
  upcoming_events_count: number
  feedback_count?: number
  feedback_positive_count?: number
  feedback_concern_count?: number
  feedback_score?: number
  pending_challenges_count: number
  is_disputed: boolean
}

type UserOrganizationListItem = {
  id: string
  name: string
  slug: string
  my_role?: 'member' | 'administrator' | 'owner' | string | null
  claimed_by_user_id?: string | null
}

function currentUrl() {
  return `${window.location.origin}/orgs`
}

export function PublicOrganizationsPage() {
  const { token } = useAuth()
  const [orgs, setOrgs] = useState<PublicOrganizationListItem[]>([])
  const [myOrgRoles, setMyOrgRoles] = useState<Map<string, string>>(new Map())
  const [showMineOnly, setShowMineOnly] = useState(false)
  const [status, setStatus] = useState<string>('Loading organizations…')
  const [membershipStatus, setMembershipStatus] = useState<string>('')

  useEffect(() => {
    setSeoMeta({
      title: 'Organizations • Org Portal',
      description: 'Browse registered organizations in the network, ranked by popularity.',
      canonicalUrl: currentUrl(),
      type: 'website',
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setMyOrgRoles(new Map())
      setShowMineOnly(false)
      return () => {
        cancelled = true
      }
    }

    fetch(orgUrl('/api/network/orgs?mine=true&limit=300'), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (resp) => {
        if (!resp.ok) return []
        return resp.json() as Promise<UserOrganizationListItem[]>
      })
      .then((rows) => {
        if (cancelled) return
        const roles = new Map<string, string>()
        for (const org of Array.isArray(rows) ? rows : []) {
          const slug = String(org.slug || '').trim()
          if (slug) roles.set(slug, String(org.my_role || 'member'))
        }
        setMyOrgRoles(roles)
      })
      .catch(() => {
        if (!cancelled) setMyOrgRoles(new Map())
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const sortedOrgs = useMemo(() => {
    return [...orgs].sort((a, b) => {
      const aMine = myOrgRoles.has(a.slug) ? 1 : 0
      const bMine = myOrgRoles.has(b.slug) ? 1 : 0
      if (aMine !== bMine) return bMine - aMine
      const memberDelta = (b.membership_count || 0) - (a.membership_count || 0)
      if (memberDelta !== 0) return memberDelta
      const eventDelta = (b.upcoming_events_count || 0) - (a.upcoming_events_count || 0)
      if (eventDelta !== 0) return eventDelta
      return a.name.localeCompare(b.name)
    })
  }, [myOrgRoles, orgs])

  const visibleOrgs = useMemo(() => {
    if (!showMineOnly) return sortedOrgs
    return sortedOrgs.filter((org) => myOrgRoles.has(org.slug))
  }, [myOrgRoles, showMineOnly, sortedOrgs])

  useEffect(() => {
    fetch(orgUrl('/api/network/orgs/public?sort=popular&limit=300'))
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          throw new Error(text || `Failed to load organizations (${resp.status})`)
        }
        return resp.json() as Promise<PublicOrganizationListItem[]>
      })
      .then((data) => {
        const incoming = Array.isArray(data) ? data : []
        const uniqueOrgs = Array.from(new Map(incoming.map((org) => [org.slug, org])).values()).sort((a, b) => {
          const memberDelta = (b.membership_count || 0) - (a.membership_count || 0)
          if (memberDelta !== 0) return memberDelta
          const eventDelta = (b.upcoming_events_count || 0) - (a.upcoming_events_count || 0)
          if (eventDelta !== 0) return eventDelta
          return a.name.localeCompare(b.name)
        })
        setOrgs(uniqueOrgs)
        setStatus('')
      })
      .catch((err) => {
        setOrgs([])
        setStatus(err instanceof Error ? err.message : 'Unable to load organizations')
      })
  }, [])

  async function updateOrganizationMembership(org: PublicOrganizationListItem, join: boolean) {
    if (!token) {
      window.location.assign(pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`))
      return
    }
    setMembershipStatus('')
    try {
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/membership`), {
        method: join ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Membership update failed (${resp.status})`)
      }
      const payload = (await resp.json()) as { status: 'active' | 'none'; membership_count: number }
      setMyOrgRoles((prev) => {
        const next = new Map(prev)
        if (payload.status === 'active') next.set(org.slug, 'member')
        else next.delete(org.slug)
        return next
      })
      setOrgs((prev) =>
        prev.map((item) =>
          item.id === org.id
            ? {
                ...item,
                membership_count: payload.membership_count,
              }
            : item,
        ),
      )
      setMembershipStatus(join ? `Joined ${org.name}.` : `Left ${org.name}.`)
    } catch (err) {
      setMembershipStatus(err instanceof Error ? err.message : 'Could not update group membership.')
    }
  }

  const jsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Organizations',
      itemListElement: sortedOrgs.slice(0, 100).map((org, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${window.location.origin}/orgs/${encodeURIComponent(org.slug)}`,
        name: org.name,
      })),
    }),
    [sortedOrgs],
  )

  useEffect(() => {
    upsertJsonLd('org-list', jsonLd)
  }, [jsonLd])

  return (
    <section className="panel" style={{ display: 'grid', gap: '1rem' }}>
      <h1 style={{ marginTop: 0 }}>Organizations</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Browse registered organizations and their claimed links.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }} role="group" aria-label="Organization list filters">
        <button
          type="button"
          className={!showMineOnly ? 'btn-primary' : undefined}
          onClick={() => setShowMineOnly(false)}
          aria-pressed={!showMineOnly}
        >
          All organizations
        </button>
        <button
          type="button"
          className={showMineOnly ? 'btn-primary' : undefined}
          onClick={() => setShowMineOnly(true)}
          disabled={!token}
          aria-pressed={showMineOnly}
        >
          Your organizations
        </button>
        {!token ? (
          <a href={pidpAppLoginUrl('/orgs')} style={{ alignSelf: 'center' }}>
            Sign in to filter yours
          </a>
        ) : null}
      </div>
      {status ? <p className="muted">{status}</p> : null}
      {membershipStatus ? <p className="muted" role="status">{membershipStatus}</p> : null}
      {!status && visibleOrgs.length === 0 ? (
        <p className="muted">No organizations were found.</p>
      ) : null}
      <div
        style={{
          display: 'grid',
          gap: '0.9rem',
        }}
      >
        {visibleOrgs.map((org) => (
          <article
            key={org.id}
            className="portal-card"
            style={{
              display: 'flex',
              gap: '0.85rem',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <OrgImage
              src={org.image_url}
              alt={org.name}
              style={{
                width: 140,
                height: 92,
                objectFit: 'cover',
                borderRadius: 10,
                border: '1px solid var(--border)',
                flex: '0 0 auto',
              }}
            />
            <div style={{ display: 'grid', gap: '0.45rem', minWidth: 0, maxWidth: '100%', flex: '1 1 240px' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                <Link to={`/orgs/${org.slug}`} style={{ textDecoration: 'none' }}>
                  {org.name}
                </Link>
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                Members: {org.membership_count} • Upcoming events: {org.upcoming_events_count}
                {` • Feedback ${org.feedback_count || 0}`}
                {org.is_disputed ? ` • Disputed ownership (${org.pending_challenges_count})` : ''}
                {myOrgRoles.has(org.slug) ? ' • Your organization' : ''}
              </p>
              {org.description ? <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{org.description}</p> : null}
              {(() => {
                const links = Array.from(
                  new Set(
                    [...(Array.isArray(org.source_urls) ? org.source_urls : []), org.source_url || '']
                      .map((item) => item?.trim())
                      .filter((item): item is string => Boolean(item)),
                  ),
                )
                if (links.length === 0) return null
                return (
                  <div style={{ display: 'grid', gap: '0.3rem' }}>
                    <p className="muted" style={{ margin: 0 }}>Claimed links:</p>
                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                      {links.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ wordBreak: 'break-word' }}
                        >
                          {url}
                        </a>
                      ))}
                    </div>
                  </div>
                )
              })()}
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label={`Actions for ${org.name}`}>
                <button
                  type="button"
                  className={myOrgRoles.has(org.slug) ? undefined : 'btn-primary'}
                  onClick={() => void updateOrganizationMembership(org, !myOrgRoles.has(org.slug))}
                  disabled={Boolean(myOrgRoles.get(org.slug) && myOrgRoles.get(org.slug) !== 'member')}
                  aria-pressed={myOrgRoles.has(org.slug)}
                >
                  {myOrgRoles.get(org.slug) === 'owner' || myOrgRoles.get(org.slug) === 'administrator'
                    ? 'Managing'
                    : myOrgRoles.has(org.slug)
                      ? 'Leave Group'
                      : 'Join Group'}
                </button>
                <Link to={`/orgs/${org.slug}`} style={{ textDecoration: 'none' }}>
                  Give Feedback
                </Link>
                {token ? (
                  <Link
                    to={`/chat?start=group&org=${encodeURIComponent(org.slug)}`}
                    className="btn-primary"
                    style={{ textDecoration: 'none', width: 'fit-content' }}
                  >
                    Message Group
                  </Link>
                ) : (
                  <a
                    href={pidpAppLoginUrl(`/chat?start=group&org=${encodeURIComponent(org.slug)}`)}
                    className="btn-primary"
                    style={{ textDecoration: 'none', width: 'fit-content' }}
                  >
                    Message Group
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
