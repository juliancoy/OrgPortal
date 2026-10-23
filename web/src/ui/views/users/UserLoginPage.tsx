import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGroupSite } from '../../../config/timebankCommunity'
import { defaultPostLoginPath, normalizePostLoginPath, pidpSingleSignOnUrl } from '../../../config/pidp'

export function UserLoginPage({ defaultNext }: { defaultNext?: string } = {}) {
  const tenant = useGroupSite()
  const title = `Sign in to ${tenant?.name || 'OrgPortal'}`
  const [searchParams] = useSearchParams()
  const next = normalizePostLoginPath(searchParams.get('next') || defaultNext || defaultPostLoginPath())
  const login = pidpSingleSignOnUrl(next)
  useEffect(() => {
    document.title = title
    window.location.replace(login)
  }, [login, title])
  return <section className="panel"><h1>{title}</h1><p>Opening your shared account…</p><a href={login}>Continue to sign in</a></section>
}
