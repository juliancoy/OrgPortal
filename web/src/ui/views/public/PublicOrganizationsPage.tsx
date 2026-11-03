import { BioMarkdown } from '../../components/profile/BioMarkdown'
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

function websiteLabel(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') || value }
  catch { return value }
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
      <header className="organization-directory-heading">
        <div><h1>Organizations</h1><p className="muted">Find a community. Get involved.</p></div>
        {!status && <span className="organization-directory-count">{sortedOrgs.length.toLocaleString()} organizations</span>}
      </header>
      {status ? <p className="muted">{status}</p> : null}
      {membershipStatus ? <p className="muted" role="status">{membershipStatus}</p> : null}
      {!status && sortedOrgs.length === 0 ? (
        <p className="muted organization-directory-empty">No organizations were found.</p>
      ) : null}
      <div className="organization-directory-grid">
        {sortedOrgs.slice(0, visibleCount).map((org) => (
          <article
            key={org.id}
            className="portal-card organization-directory-card"
          >
            <header className="organization-directory-card-header">
              <OrgImage src={org.image_url} alt={org.name} className="organization-directory-logo" />
              <div className="organization-directory-identity">
                <h2>
                  <Link className="organization-directory-link" to={`/orgs/${org.slug}`}>
                    <span title={org.name}>{shortGroupName(org.name)}</span>
                  </Link>
                </h2>
                {myOrgRoles.has(org.slug) && <span className="organization-directory-membership">Your organization</span>}
                {org.is_disputed && <span className="organization-directory-disputed">Disputed ownership ({org.pending_challenges_count})</span>}
              </div>
            </header>
            <dl className="organization-directory-stats">
              <div><dt>Members</dt><dd>{(org.membership_count || 0).toLocaleString()}</dd></div>
              <div><dt>Upcoming</dt><dd>{(org.upcoming_events_count || 0).toLocaleString()}</dd></div>
              <div><dt>Feedback</dt><dd>{(org.feedback_count || 0).toLocaleString()}</dd></div>
            </dl>
            <div className="organization-directory-body">
              {org.description ? <BioMarkdown className="organization-directory-description" value={org.description} /> : null}
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
                  <div className="organization-directory-websites" aria-label={`Websites for ${org.name}`}>
                    <div>
                      {links.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="organization-directory-website"
                        >
                          {websiteLabel(url)} <span aria-hidden="true">↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
            <footer className="organization-directory-actions" role="group" aria-label={`Actions for ${org.name}`}>
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
              <Link className="btn-secondary" to={`/orgs/${org.slug}`}>
                Give Feedback
              </Link>
              {token ? (
                <Link
                  to={`/chat?start=group&org=${encodeURIComponent(org.slug)}`}
                  className="btn-secondary"
                >
                  Message Group
                </Link>
              ) : (
                <a
                  href={pidpAppLoginUrl(`/chat?start=group&org=${encodeURIComponent(org.slug)}`)}
                  className="btn-secondary"
                >
                  Message Group
                </a>
              )}
            </footer>
          </article>
        ))}
      </div>
      {sortedOrgs.length > visibleCount && <button type="button" className="btn-secondary" onClick={() => setVisibleCount(count => count + 300)}>Show more organizations</button>}
    </section>
  )
}
