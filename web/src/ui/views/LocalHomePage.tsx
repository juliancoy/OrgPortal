import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'
import { ArrowUpRight, Building2, CalendarDays, Compass, Network, Settings, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../app/AppProviders'
import { isPortalFeatureEnabled } from '../../config/portalFeatures'
import './local-home.css'

const sections = [
  { title: 'Ecosystem research', description: 'Follow the relationships. Explore organizations, funding, and public evidence.', icon: Network, links: [
    ['Network explorer · all graph types', '/ecosystem/network'],
    ['Research overview', '/ecosystem/network/overview'], ['Relationships & evidence', '/ecosystem/network/relationships'], ['Event history', '/ecosystem/network/events'],
    ['Funding performance', '/ecosystem/network/performance'], ['Interventions', '/ecosystem/network/interventions'], ['Nonprofit research', '/ecosystem/network/nonprofits'], ['Funding gap', '/ecosystem/network/funding'], ['Sources & help', '/ecosystem/network/help'],
  ] },
  { title: 'Community', description: 'Find your people and the organizations bringing them together.', icon: Building2, links: [
    ['Organizations', '/orgs'], ['People', '/people'], ['Communities', '/communities'], ['Following', '/following'], ['Resources', '/resources'], ['Register an organization', '/orgs/register'], ['Chat', '/chat'], ['Organization profile', '/orgs/profile'], ['Organization account', '/orgs/account'], ['Create an organization', '/create'], ['Create a business', '/create/for-profit'], ['Create a nonprofit', '/create/non-profit'], ['Search everything', '/search'],
  ] },
  { title: 'Events & coordination', description: 'Discover events, find a time, and keep your calendars connected.', icon: CalendarDays, links: [
    ['Upcoming events', '/events'], ['Calendar', '/calendar'], ['Find a meeting time', '/availability'], ['Meetings', '/meetings'], ['Calendar integrations', '/calendar/integrations'], ['Event management', '/orgs/events'], ['Venues', '/orgs/events/venues'],
  ] },
  { title: 'Community tools', description: 'Organize, share resources, and put ideas into practice.', icon: Compass, links: [
    ['Timebanking', '/timebanking'], ['Governance', '/governance'], ['Email campaigns', '/email'], ['Business card intake', '/tools/business-cards'], ['Local newsletters', '/local/newsletters'], ['Finance', '/finance'], ['Send', '/send'], ['Receive', '/receive'], ['Health insurance', '/health-insurance'], ['Life insurance', '/life-insurance'], ['Property & casualty insurance', '/property-casualty-insurance'], ['Provider scheduling', '/provider-scheduling'], ['Departments', '/departments'], ['Organization initiatives', '/orgs/initiatives'], ['Editable initiatives', '/orgs/initiatives/editable'], ['Create an initiative', '/orgs/initiatives/new'], ['Propose a motion', '/governance/propose'], ['Parliamentary motions', '/governance/roberts'], ['LifeTech constitution', '/governance/documents/lifetech-constitution'],
  ] },
  { title: 'Your account', description: 'Your profile, identity, and preferences in one place.', icon: Settings, links: [
    ['Dashboard', '/users/dashboard'], ['Profile', '/profile'], ['Settings', '/settings'], ['Notifications', '/settings/notifications'], ['ID card', '/id'], ['Get started', '/onboarding'], ['Email preferences', '/email/preferences'], ['Connect an AI assistant', '/users/mcp-connect'], ['Install Android app', '/android/install'],
  ] },
  { title: 'Administration', description: 'Platform controls and local services. Administrator or organizer access may be required.', icon: ShieldCheck, links: [
    ['System administration & abuse controls', '/admin'], ['Platform statistics', '/admin?tab=stats'], ['Accounts', '/admin?tab=users'], ['Operations', '/admin?tab=ops'], ['Print nametags', '/admin/nametags'], ['UBI settings', '/admin/ubi-settings'], ['Developer tools', '/dev-tools'], ['Portal branding', '/branding'], ['Identity portal', '/pidp/'], ['Local services', '/services/'], ['About OrgPortal', '/about'], ['Terms & privacy', '/terms'],
  ] },
] as const

export function LocalHomePage() {
  const { role, user, token, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [organizationStatus, setOrganizationStatus] = useState('')
  const [organizationsLoading, setOrganizationsLoading] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setOrganizations([])
    setOrganizationStatus('')
    setOrganizationsLoading(Boolean(token))
    if (!token) return () => controller.abort()
    async function loadOrganizations() {
      try {
        const request = (accessToken: string) => fetch('/api/org/api/network/orgs?mine=true&limit=300', {
          headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
        })
        let response = await request(token!)
        if (response.status === 401) {
          const refreshed = await refreshRuntimeTokenFromSession()
          if (refreshed && !controller.signal.aborted) response = await request(refreshed)
        }
        if (!response.ok) throw new Error('Unable to load your organizations.')
        const rows = await response.json()
        if (!Array.isArray(rows) || rows.some(row => !row ||
          typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.slug !== 'string')) {
          throw new Error('Invalid organization response.')
        }
        if (!controller.signal.aborted) {
          setOrganizations(rows)
          if (!rows.length) setOrganizationStatus('You have not joined any organizations yet.')
        }
      } catch {
        if (!controller.signal.aborted) setOrganizationStatus('Unable to load your organizations. Please reload to try again.')
      } finally {
        if (!controller.signal.aborted) setOrganizationsLoading(false)
      }
    }
    void loadOrganizations()
    return () => controller.abort()
  }, [token])
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const visible = sections.map(section => ({ ...section, links: section.links.filter(([label, path]) => (path !== '/admin/ubi-settings' || isPortalFeatureEnabled('ubi')) && `${section.title} ${label}`.toLowerCase().includes(search)) })).filter(section => section.links.length)
  useEffect(() => { document.title = 'OrgPortal • Workspace' }, [])
  return <div className="portal-shell workspace-home">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="workspace-header"><div className="portal-container workspace-header-inner">
      <Link to="/" className="workspace-brand"><span aria-hidden="true">O</span>OrgPortal <small>Local workspace</small></Link>
      <div className="workspace-account">{isLoading ? <span role="status">Checking sign-in…</span> : role === 'guest' ? <Link to="/users/login?next=%2F" className="btn-secondary">Sign in</Link> : <><Link to="/profile">{user?.displayName || 'Your account'}</Link><button onClick={logout}>Sign out</button></>}</div>
    </div></header>
    <main id="main-content" className="portal-main" tabIndex={-1}><div className="portal-container">
      <div className="workspace-organization-switcher">
        <label htmlFor="workspace-organization">Your organizations</label>
        <select id="workspace-organization" value="" disabled={!token || organizationsLoading || !organizations.length} onChange={event => {
          if (event.target.value) navigate(`/orgs/${encodeURIComponent(event.target.value)}`)
        }}>
          <option value="">{isLoading || organizationsLoading ? 'Loading organizations…' : !token ? 'Sign in to choose an organization' : 'Choose an organization…'}</option>
          {organizations.map(organization => <option key={organization.id} value={organization.slug}>{organization.name}</option>)}
        </select>
        {organizationStatus && <span role="status">{organizationStatus}</span>}
      </div>
      <section className="workspace-hero" aria-labelledby="workspace-title">
        <p className="workspace-eyebrow">Your starting point</p>
        <h1 id="workspace-title">A place to explore.<br /><span>A place to get things done.</span></h1>
        <p>Research the ecosystem, connect with your community, and find the tools you need. Choose an area to see its tools and services.</p>
        <div className="workspace-quick-links"><Link to="/ecosystem/network">Explore the ecosystem <ArrowUpRight size={18} aria-hidden="true" /></Link><Link to="/orgs">Browse organizations</Link><Link to="/admin">Open administration</Link></div>
      </section>
      <div className="workspace-directory-heading"><div><h2>Everything in your workspace</h2><p>Restricted pages use your existing sign-in and permissions.</p></div><label><span className="sr-only">Find a page</span><input type="search" placeholder="Find a page…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      <nav className="workspace-grid" aria-label="Workspace navigation">{visible.map(section => <details className="workspace-section" key={`${section.title}-${search ? 'search' : 'browse'}`} open={search ? true : undefined}>
        <summary>
          <span className="workspace-section-icon"><section.icon size={44} strokeWidth={1.5} aria-hidden="true" /></span>
          <h3>{section.title}</h3>
          <span className="workspace-section-description">{section.description}</span>
          <span className="workspace-section-count">{section.links.length} services <span aria-hidden="true">⌄</span></span>
        </summary>
        <ul>{section.links.map(([label, path]) => <li key={path}>{path === '/pidp/' || path === '/services/' ? <a href={path}>{label}<ArrowUpRight size={15} aria-hidden="true" /></a> : <Link to={path}>{label}<ArrowUpRight size={15} aria-hidden="true" /></Link>}</li>)}</ul>
      </details>)}</nav>
      {visible.length === 0 && <p role="status" className="workspace-empty">No pages match “{query}”. Try research, events, or settings.</p>}
    </div></main><footer className="workspace-footer"><div className="portal-container"><span>OrgPortal · Local workspace</span><nav aria-label="About this workspace"><Link to="/about">About</Link><Link to="/terms">Terms &amp; privacy</Link></nav></div></footer>
  </div>
}
