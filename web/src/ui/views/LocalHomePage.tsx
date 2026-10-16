import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Building2, CalendarDays, Compass, Network, Settings, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../app/AppProviders'
import { isPortalFeatureEnabled } from '../../config/portalFeatures'
import './local-home.css'

const sections = [
  { title: 'Ecosystem research', description: 'Follow the relationships. Explore organizations, funding, and public evidence.', icon: Network, links: [
    ['Network graph', '/ecosystem/network'], ['WebGPU graph', '/ecosystem/network/webgpu'], ['3D map', '/ecosystem/network/3d'], ['4D map', '/ecosystem/network/4d'],
    ['Research overview', '/ecosystem/network/overview'], ['Relationships & evidence', '/ecosystem/network/relationships'], ['Event history', '/ecosystem/network/events'],
    ['Funding performance', '/ecosystem/network/performance'], ['Interventions', '/ecosystem/network/interventions'], ['Nonprofit research', '/ecosystem/network/nonprofits'], ['Funding gap', '/ecosystem/network/funding'], ['Sources & help', '/ecosystem/network/help'],
  ] },
  { title: 'Community', description: 'Find your people and the organizations bringing them together.', icon: Building2, links: [
    ['Organizations', '/orgs'], ['People', '/people'], ['Communities', '/communities'], ['Following', '/following'], ['Resources', '/resources'], ['Register an organization', '/orgs/register'],
  ] },
  { title: 'Events & coordination', description: 'Discover events, find a time, and keep your calendars connected.', icon: CalendarDays, links: [
    ['Upcoming events', '/events'], ['Calendar', '/calendar'], ['Find a meeting time', '/availability'], ['Meetings', '/meetings'], ['Calendar integrations', '/calendar/integrations'], ['Event management', '/orgs/events'], ['Venues', '/orgs/events/venues'],
  ] },
  { title: 'Community tools', description: 'Organize, share resources, and put ideas into practice.', icon: Compass, links: [
    ['Timebanking', '/timebanking'], ['Governance', '/governance'], ['Email campaigns', '/email'], ['Business card intake', '/tools/business-cards'], ['Local newsletters', '/local/newsletters'], ['Finance', '/finance'], ['Send', '/send'], ['Receive', '/receive'], ['Health insurance', '/health-insurance'], ['Life insurance', '/life-insurance'],
  ] },
  { title: 'Your account', description: 'Your profile, identity, and preferences in one place.', icon: Settings, links: [
    ['Dashboard', '/users/dashboard'], ['Profile', '/profile'], ['Settings', '/settings'], ['Notifications', '/settings/notifications'], ['ID card', '/id'], ['Get started', '/onboarding'],
  ] },
  { title: 'Administration', description: 'Platform controls and local services. Administrator or organizer access may be required.', icon: ShieldCheck, links: [
    ['System administration', '/admin'], ['Platform statistics', '/admin?tab=stats'], ['Accounts', '/admin?tab=users'], ['Operations', '/admin?tab=ops'], ['Print nametags', '/admin/nametags'], ['UBI settings', '/admin/ubi-settings'], ['Developer tools', '/dev-tools'], ['Portal branding', '/branding'], ['Identity portal', '/pidp/'], ['Local services', '/services/'],
  ] },
] as const

export function LocalHomePage() {
  const { role, user, isLoading, logout } = useAuth()
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
      <section className="workspace-hero" aria-labelledby="workspace-title">
        <p className="workspace-eyebrow">Your starting point</p>
        <h1 id="workspace-title">A place to explore.<br /><span>A place to get things done.</span></h1>
        <p>Research the ecosystem, connect with your community, and find the tools you need. Choose where to go next.</p>
        <div className="workspace-quick-links"><Link to="/ecosystem/network">Explore the ecosystem <ArrowUpRight size={18} aria-hidden="true" /></Link><Link to="/orgs">Browse organizations</Link><Link to="/admin">Open administration</Link></div>
      </section>
      <div className="workspace-directory-heading"><div><h2>Everything in your workspace</h2><p>Restricted pages use your existing sign-in and permissions.</p></div><label><span className="sr-only">Find a page</span><input type="search" placeholder="Find a page…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      <nav className="workspace-grid" aria-label="Workspace navigation">{visible.map(section => <section className="workspace-section" key={section.title} aria-labelledby={`workspace-${sections.findIndex(item=>item.title===section.title)}`}>
        <div className="workspace-section-title"><section.icon size={22} aria-hidden="true" /><h3 id={`workspace-${sections.findIndex(item=>item.title===section.title)}`}>{section.title}</h3></div><p>{section.description}</p>
        <ul>{section.links.map(([label, path]) => <li key={path}>{path === '/pidp/' || path === '/services/' ? <a href={path}>{label}<ArrowUpRight size={15} aria-hidden="true" /></a> : <Link to={path}>{label}<ArrowUpRight size={15} aria-hidden="true" /></Link>}</li>)}</ul>
      </section>)}</nav>
      {visible.length === 0 && <p role="status" className="workspace-empty">No pages match “{query}”. Try research, events, or settings.</p>}
    </div></main><footer className="workspace-footer"><div className="portal-container"><span>OrgPortal · Local workspace</span><nav aria-label="About this workspace"><Link to="/about">About</Link><Link to="/terms">Terms &amp; privacy</Link></nav></div></footer>
  </div>
}
