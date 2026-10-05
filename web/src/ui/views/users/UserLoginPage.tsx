import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { portalPath } from '../../../config/portalBase'
import { defaultPostLoginPath, normalizePostLoginPath, pidpSingleSignOnUrl } from '../../../config/pidp'
import { getActivePortalProfileConfig } from '../../../config/portalFeatures'
import { GoogleLoginEntry } from '../../components/GoogleLoginEntry'

export function UserLoginPage({ defaultNext }: { defaultNext?: string } = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isLoading, role } = useAuth()
  const portalProfile = getActivePortalProfileConfig()
  const tenantAuth = Boolean(portalProfile.tenantId)
  const requestedNext = normalizePostLoginPath(searchParams.get('next') || defaultNext || defaultPostLoginPath())
  const socialLoginUrl = (provider: 'google' | 'github') => pidpSingleSignOnUrl(requestedNext, provider)

  useEffect(() => {
    document.title = `${portalProfile.portalTitle} • User login`
  }, [portalProfile.portalTitle])

  useEffect(() => {
    if (!isLoading && role !== 'guest') {
      navigate(requestedNext)
    }
  }, [isLoading, role, navigate, requestedNext])

  return (
    <section className="portal-auth-page" aria-labelledby="user-login-title">
      <div className="panel portal-auth-card">
        <div className="portal-auth-card-header">
          {tenantAuth && portalProfile.brandImagePath && <img className="tenant-auth-logo" src={portalPath(portalProfile.brandImagePath)} alt="" />}
          <p className="portal-auth-eyebrow">{tenantAuth ? portalProfile.tagline : `${portalProfile.brandName} identity`}</p>
          <h1 id="user-login-title">Log In</h1>
        </div>

        <div className="portal-auth-provider-stack">
          <div className="portal-guest-login-actions portal-auth-provider-actions" aria-label="Sign in options">
            <GoogleLoginEntry next={requestedNext} />
            <a
              href={socialLoginUrl('github')}
              className="portal-social-login-button"
              aria-label="Continue with GitHub"
            >
              <img src={portalPath('/images/github-mark.svg')} alt="" className="portal-social-login-logo" />
              <span>Continue with GitHub</span>
            </a>
          </div>
          <a
            href={pidpSingleSignOnUrl(requestedNext)}
            className="portal-button portal-auth-idp-link"
          >
            Continue with email
          </a>
        </div>

        <p className="muted">Sign in once to use your account across connected services.</p>

        {tenantAuth && <p className="tenant-shared-account">Your existing Code Collective account works here.</p>}
      </div>
    </section>
  )
}
