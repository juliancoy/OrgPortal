import { getActivePortalProfileConfig } from '../../config/portalFeatures'

export function Footer() {
  const profile = getActivePortalProfileConfig()
  return <footer className="portal-footer" role="contentinfo"><div className="portal-footer-inner">
    <div><div className="portal-brand-title">{profile.brandName}</div><div className="portal-brand-sub">{profile.tagline}</div></div>
    {profile.id === 'baltimore-medtech' ? <a href="https://codecollective.us/">Powered by Code Collective</a> : <span>© 2026 Code Collective</span>}
  </div></footer>
}
