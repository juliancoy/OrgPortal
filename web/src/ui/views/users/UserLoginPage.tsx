import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { portalAssetPath, portalPath } from '../../../config/portalBase'
import { defaultPostLoginPath, normalizePostLoginPath, pidpSingleSignOnUrl } from '../../../config/pidp'
import { getActivePortalProfileConfig } from '../../../config/portalFeatures'
import { GoogleLoginEntry } from '../../components/GoogleLoginEntry'

export function UserLoginPage({ defaultNext }: { defaultNext?: string } = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isLoading, role } = useAuth()
  const portalProfile = getActivePortalProfileConfig()
  const groupBranding = Boolean(portalProfile.groupSiteId)
  const requestedNext = normalizePostLoginPath(searchParams.get('next') || defaultNext || defaultPostLoginPath())
  const socialLoginUrl = (provider: 'google' | 'github') => pidpSingleSignOnUrl(requestedNext, provider)

  useEffect(() => {
    document.title = 'OrgPortal • Sign in'
  }, [portalProfile.portalTitle])

  useEffect(() => {
    if (!isLoading && role !== 'guest') {
      navigate(requestedNext, { replace: true })
    }
  }, [isLoading, role, navigate, requestedNext])

  return (
    <section className="portal-auth-page" aria-labelledby="user-login-title">
      <div className="panel portal-auth-card">
        <div className="portal-auth-card-header">
          {groupBranding && portalProfile.brandImagePath && <img className="tenant-auth-logo" src={portalAssetPath(portalProfile.brandImagePath)} alt="" />}
          <p className="portal-auth-eyebrow">{groupBranding ? portalProfile.tagline : `${portalProfile.brandName} identity`}</p>
          <h1 id="user-login-title">Sign in to OrgPortal</h1>
          <p className="portal-auth-intro">One account for all your groups. Choose how you’d like to continue.</p>
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
          <div className="portal-auth-divider" aria-hidden="true">or</div>
          <a
            href={pidpSingleSignOnUrl(requestedNext)}
            className="portal-auth-email-link"
          >
            Continue with email
          </a>
        </div>

        <p className="portal-auth-help">Sign in or create an account using any option above.</p>

        <p className="tenant-shared-account">Group membership and organizer access are managed separately for each group.</p>
      </div>
    </section>
  )
}
