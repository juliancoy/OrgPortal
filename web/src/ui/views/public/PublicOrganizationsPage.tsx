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
  favor_count?: number
  disfavor_count?: number
  sentiment_score?: number
  pending_claim_requests_count: number
  is_contested: boolean
}

type OrganizationSentiment = {
  organization_id: string
  sentiment: 'favor' | 'disfavor' | null
  favor_count: number
  disfavor_count: number
  sentiment_score: number
}

type UserOrganizationListItem = {
  id: string
  name: string
  slug: string
  my_role?: 'member' | 'admin' | string | null
  claimed_by_user_id?: string | null
}

function currentUrl() {
  return `${window.location.origin}/orgs`
}

export function PublicOrganizationsPage() {
  const { token } = useAuth()
  const [orgs, setOrgs] = useState<PublicOrganizationListItem[]>([])
  const [myOrgSlugs, setMyOrgSlugs] = useState<Set<string>>(new Set())
  const [mySentiments, setMySentiments] = useState<Record<string, 'favor' | 'disfavor' | null>>({})
  const [showMineOnly, setShowMineOnly] = useState(false)
  const [status, setStatus] = useState<string>('Loading organizations…')
  const [sentimentStatus, setSentimentStatus] = useState<string>('')

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
      setMyOrgSlugs(new Set())
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
        const slugs = new Set(
          (Array.isArray(rows) ? rows : [])
            .map((org) => String(org.slug || '').trim())
            .filter(Boolean),
        )
        setMyOrgSlugs(slugs)
      })
      .catch(() => {
        if (!cancelled) setMyOrgSlugs(new Set())
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const sortedOrgs = useMemo(() => {
    return [...orgs].sort((a, b) => {
      const aMine = myOrgSlugs.has(a.slug) ? 1 : 0
      const bMine = myOrgSlugs.has(b.slug) ? 1 : 0
      if (aMine !== bMine) return bMine - aMine
      const memberDelta = (b.membership_count || 0) - (a.membership_count || 0)
      if (memberDelta !== 0) return memberDelta
      const eventDelta = (b.upcoming_events_count || 0) - (a.upcoming_events_count || 0)
      if (eventDelta !== 0) return eventDelta
      return a.name.localeCompare(b.name)
    })
  }, [myOrgSlugs, orgs])

  const visibleOrgs = useMemo(() => {
    if (!showMineOnly) return sortedOrgs
    return sortedOrgs.filter((org) => myOrgSlugs.has(org.slug))
  }, [myOrgSlugs, showMineOnly, sortedOrgs])

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

  async function setOrganizationSentiment(org: PublicOrganizationListItem, sentiment: 'favor' | 'disfavor') {
    if (!token) {
      window.location.assign(pidpAppLoginUrl(`/orgs/${encodeURIComponent(org.slug)}`))
      return
    }
    setSentimentStatus('')
    try {
      const current = mySentiments[org.id]
      const method = current === sentiment ? 'DELETE' : 'PUT'
      const resp = await fetch(orgUrl(`/api/network/orgs/${encodeURIComponent(org.id)}/sentiment`), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: method === 'PUT' ? JSON.stringify({ sentiment }) : undefined,
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(text || `Sentiment update failed (${resp.status})`)
      }
      const payload = (await resp.json()) as OrganizationSentiment
      setMySentiments((prev) => ({ ...prev, [org.id]: payload.sentiment }))
      setOrgs((prev) =>
        prev.map((item) =>
          item.id === org.id
            ? {
                ...item,
                favor_count: payload.favor_count,
                disfavor_count: payload.disfavor_count,
                sentiment_score: payload.sentiment_score,
              }
            : item,
        ),
      )
    } catch (err) {
      setSentimentStatus(err instanceof Error ? err.message : 'Could not update organization preference.')
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
      {sentimentStatus ? <p className="muted" role="status">{sentimentStatus}</p> : null}
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
                {` • Favor ${org.favor_count || 0} / Disfavor ${org.disfavor_count || 0}`}
                {org.is_contested ? ` • Contested ownership (${org.pending_claim_requests_count})` : ''}
                {myOrgSlugs.has(org.slug) ? ' • Your organization' : ''}
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
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label={`Preference for ${org.name}`}>
                <button
                  type="button"
                  className={mySentiments[org.id] === 'favor' ? 'btn-primary' : undefined}
                  onClick={() => void setOrganizationSentiment(org, 'favor')}
                  aria-pressed={mySentiments[org.id] === 'favor'}
                  aria-label={`Favor ${org.name}. ${org.favor_count || 0} favor votes`}
                >
                  Favor
                </button>
                <button
                  type="button"
                  className={mySentiments[org.id] === 'disfavor' ? 'btn-primary' : undefined}
                  onClick={() => void setOrganizationSentiment(org, 'disfavor')}
                  aria-pressed={mySentiments[org.id] === 'disfavor'}
                  aria-label={`Disfavor ${org.name}. ${org.disfavor_count || 0} disfavor votes`}
                >
                  Disfavor
                </button>
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
