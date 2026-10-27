import './organizationDirectory.css'
import { invalidatePublicOrganizationData } from '../../../data/publicOrganization/cache'
import { loadPublicOrganizationDirectory, peekPublicOrganizationDirectory } from '../../../data/publicOrganization/organizations'
import { shortGroupName } from '../../../domain/organization/groupNames'
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
  const [cachedOrgs] = useState(() => peekPublicOrganizationDirectory<PublicOrganizationListItem>())
  const [orgs, setOrgs] = useState<PublicOrganizationListItem[]>(cachedOrgs || [])
  const [myOrgRoles, setMyOrgRoles] = useState<Map<string, string>>(new Map())
  const [visibleCount, setVisibleCount] = useState(300)
  const [status, setStatus] = useState<string>(cachedOrgs ? '' : 'Loading organizations…')
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


  useEffect(() => {
    const controller = new AbortController()
    void loadPublicOrganizationDirectory<PublicOrganizationListItem>({signal:controller.signal,onPage: rows => {
      if (controller.signal.aborted) return
      setOrgs(Array.from(new Map(rows.map(org => [org.slug, org])).values()))
      setStatus('Loading more organizations…')
    }})
      .then((data) => {
        const incoming = Array.isArray(data) ? data : []
        const uniqueOrgs = Array.from(new Map(incoming.map((org) => [org.slug, org])).values()).sort((a, b) => {
          const memberDelta = (b.membership_count || 0) - (a.membership_count || 0)
          if (memberDelta !== 0) return memberDelta
          const eventDelta = (b.upcoming_events_count || 0) - (a.upcoming_events_count || 0)
          if (eventDelta !== 0) return eventDelta
          return a.name.localeCompare(b.name)
        })
        if (controller.signal.aborted) return
        setOrgs(uniqueOrgs)
        setStatus('')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setStatus(err instanceof Error ? err.message : 'Unable to load organizations')
      })
    return () => controller.abort()
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
      const payload = (await resp.json()) as { status: 'active' | 'pending' | 'none'; membership_count: number }
      await invalidatePublicOrganizationData()
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
      setMembershipStatus(join ? `Membership requested for ${org.name}. A manager must approve it.` : `Left ${org.name}.`)
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
    <section className="organization-directory" style={{ display: 'grid', gap: '1rem' }}>
      <h1 className="sr-only">Organizations</h1>
      {status ? <p className="muted">{status}</p> : null}
      {membershipStatus ? <p className="muted" role="status">{membershipStatus}</p> : null}
      {!status && sortedOrgs.length === 0 ? (
        <p className="muted organization-directory-empty">No organizations were found.</p>
      ) : null}
      <div
        style={{
          display: 'grid',
          gap: '0.9rem',
        }}
      >
        {sortedOrgs.slice(0, visibleCount).map((org) => (
          <article
            key={org.id}
            className="portal-card organization-directory-card"
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
                width: 64,
                height: 64,
                objectFit: 'contain',
                borderRadius: 10,
                border: '1px solid var(--border)',
                flex: '0 0 auto',
              }}
            />
            <div style={{ display: 'grid', gap: '0.45rem', minWidth: 0, maxWidth: '100%', flex: '1 1 200px' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                <Link className="organization-directory-link" to={`/orgs/${org.slug}`} style={{ textDecoration: 'none' }}>
                  <span title={org.name}>{shortGroupName(org.name)}</span>
                </Link>
              </h2>
              <p className="muted organization-directory-meta" style={{ margin: 0 }}>
                Members: {org.membership_count} • Upcoming events: {org.upcoming_events_count}
                {` • Feedback ${org.feedback_count || 0}`}
                {org.is_disputed ? ` • Disputed ownership (${org.pending_challenges_count})` : ''}
                {myOrgRoles.has(org.slug) ? ' • Your organization' : ''}
              </p>
              {org.description ? <p className="organization-directory-description" style={{ margin: 0, overflowWrap: 'anywhere' }}>{org.description}</p> : null}
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
                  className={myOrgRoles.has(org.slug) ? 'btn-secondary' : 'btn-primary'}
                  onClick={() => void updateOrganizationMembership(org, !myOrgRoles.has(org.slug))}
                  disabled={Boolean(myOrgRoles.get(org.slug) && myOrgRoles.get(org.slug) !== 'member')}
                  aria-pressed={myOrgRoles.has(org.slug)}
                >
                  {myOrgRoles.get(org.slug) === 'owner' || myOrgRoles.get(org.slug) === 'administrator'
                    ? 'Managing'
                    : myOrgRoles.has(org.slug)
                      ? 'Leave Group'
                      : 'Request to join'}
                </button>
                <Link to={`/orgs/${org.slug}`} style={{ textDecoration: 'none' }}>
                  Give Feedback
                </Link>
                {token ? (
                  <Link
                    to={`/chat?start=group&org=${encodeURIComponent(org.slug)}`}
                    className="btn-secondary"
                    style={{ textDecoration: 'none', width: 'fit-content' }}
                  >
                    Message Group
                  </Link>
                ) : (
                  <a
                    href={pidpAppLoginUrl(`/chat?start=group&org=${encodeURIComponent(org.slug)}`)}
                    className="btn-secondary"
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
      {sortedOrgs.length > visibleCount && <button type="button" className="btn-secondary" onClick={() => setVisibleCount(count => count + 300)}>Show more organizations</button>}
    </section>
  )
}
