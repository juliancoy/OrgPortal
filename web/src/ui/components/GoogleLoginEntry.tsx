import { pidpSingleSignOnUrl } from '../../config/pidp'
import { portalPath } from '../../config/portalBase'

// PIdP owns account selection, provider authentication, and the return handoff.
export function GoogleLoginEntry({ next }: { next: string }) {
  return <a href={pidpSingleSignOnUrl(next, 'google')} className="portal-social-login-button" aria-label="Continue with Google">
    <img src={portalPath('/images/google-g-logo.svg')} alt="" className="portal-social-login-logo" />
    <span>Continue with Google</span>
  </a>
}
