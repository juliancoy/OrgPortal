import { Link } from 'react-router-dom'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'

export function Footer() {
  const profile = getActivePortalProfileConfig()
  return <footer className="portal-footer" role="contentinfo"><div className="portal-footer-inner">
    <div><div className="portal-brand-title">{profile.brandName}</div><div className="portal-brand-sub">{profile.tagline}</div></div>
    <div className="portal-footer-links">
      {profile.id === 'orgportal' ? <Link to="/about">About OrgPortal</Link> : <a href="https://orgportal.cc/about">About OrgPortal</a>}
      <Link to="/terms">Terms & privacy</Link>
      {profile.id === 'orgportal' ? <span>© {new Date().getFullYear()} OrgPortal</span> : <a href="https://orgportal.cc/">A community on OrgPortal</a>}
    </div>
  </div></footer>
}
