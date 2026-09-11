import { Link } from 'react-router-dom'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { useDomainCommunity, useDomainTenant } from '../../config/timebankCommunity'

export function Footer() {
  const community = useDomainCommunity()
  const tenant = useDomainTenant()
  const profile = getActivePortalProfileConfig()
  return <footer className="portal-footer" role="contentinfo"><div className="portal-footer-inner">
    <div><div className="portal-brand-title">{profile.brandName}</div><div className="portal-brand-sub">{profile.tagline}</div></div>
    <div className="portal-footer-links">
      <Link to="/terms">Terms & privacy</Link>
      {tenant && !community ? <a href="https://codecollective.us/">Powered by Code Collective</a> : <span>{community ? 'A community on Code Collective' : '© 2026 Code Collective'}</span>}
    </div>
  </div></footer>
}
