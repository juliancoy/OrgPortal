import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { Header } from '../shell/Header'
import { Footer } from '../shell/Footer'
import './platform.css'

type Community = { id: string; name: string; tagline: string; url: string; features: string[] }

export function CommunitiesPage({ preview = false }: { preview?: boolean }) {
  const [communities, setCommunities] = useState<Community[]>([])
  const [status, setStatus] = useState('Loading communities…')
  const [search, setSearch] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [params] = useSearchParams()
  const timebanksOnly = params.get('feature') === 'timebank'
  useEffect(() => {
    const controller = new AbortController()
    setStatus('Loading communities…')
    fetch('/api/org/api/portal/communities', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Communities could not be loaded. Please try again.')
        return response.json() as Promise<Community[]>
      })
      .then(rows => { setCommunities(rows); setStatus('') })
      .catch(error => { if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Unable to load communities.') })
    return () => controller.abort()
  }, [attempt])
  const visible = useMemo(() => communities.filter(community =>
    (!timebanksOnly || community.features.includes('timebank'))
    && `${community.name} ${community.tagline}`.toLowerCase().includes(search.trim().toLowerCase())), [communities, search, timebanksOnly])
  return <section className="platform-communities" aria-labelledby="community-heading">
    <div className="platform-section-heading">
      <div><p className="platform-eyebrow">Find your people</p><h2 id="community-heading">{timebanksOnly ? 'Choose a Timebank community' : 'Choose a community'}</h2></div>
      {preview && <Link to="/communities">Browse communities →</Link>}
    </div>
    <p className="muted">{timebanksOnly ? 'Each community has its own board and hours ledger.' : 'Explore a community’s own portal, events, and ways to participate.'}</p>
    {!preview && <label className="platform-search">Search communities<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or interest" /></label>}
    {status && <p role="status">{status} {status !== 'Loading communities…' && <button type="button" className="btn-secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button>}</p>}
    {!status && !visible.length && <p>No communities match your search.</p>}
    <div className="platform-community-grid">
      {visible.map(community => <article className="platform-community-card" key={community.id}>
        <div className="platform-community-mark" aria-hidden="true">{community.name.split(' ').slice(0, 2).map(word => word[0]).join('')}</div>
        <h3>{community.name}</h3><p>{community.tagline}</p>
        <div className="platform-community-features">{community.features.filter(feature => ['timebank', 'events', 'directory', 'chat'].includes(feature)).map(feature => <span key={feature}>{feature === 'directory' ? 'People & organizations' : feature === 'chat' ? 'Messages' : feature === 'timebank' ? 'Timebank' : 'Events'}</span>)}</div>
        <a href={community.url} className="platform-community-open">Open community <span aria-hidden="true">↗</span></a>
      </article>)}
    </div>
    {!preview && <p className="platform-account-note">Your account identifies you across communities. Joining a community and receiving a role are separate choices.</p>}
  </section>
}

export function PlatformHomePage() {
  const { role } = useAuth()
  useEffect(() => { document.title = 'OrgPortal · A place for every community' }, [])
  return <div className="portal-shell platform-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Header />
    <main id="main-content" className="portal-main" tabIndex={-1}><div className="portal-container">
      <section className="platform-hero" aria-labelledby="platform-title">
        <p className="platform-eyebrow">OrgPortal</p>
        <h1 id="platform-title">A place for<br /><span>every community.</span></h1>
        <p className="platform-hero-description">Find organizations, meet people, and make things happen together. Each community brings its own identity. OrgPortal gives you a shared place to connect.</p>
        <div className="platform-hero-actions"><Link className="btn-primary" to="/communities">Find your community</Link><Link className="btn-secondary" to={role === 'guest' ? '/users/login' : '/orgs'}>{role === 'guest' ? 'Sign in' : 'Your organizations'}</Link></div>
        <p className="platform-account-note">One account. Community membership by choice.</p>
      </section>
      <CommunitiesPage preview />
      <section className="platform-explore" aria-label="Explore OrgPortal">
        <Link to="/orgs"><strong>Discover organizations</strong><span>Browse public profiles and find groups you care about. →</span></Link>
        <Link to="/events"><strong>Find an event</strong><span>See what’s happening and where you can participate. →</span></Link>
        <Link to="/communities?feature=timebank"><strong>Share your time</strong><span>Choose a community to offer skills or ask for help. →</span></Link>
      </section>
    </div></main><Footer />
  </div>
}
