import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { defaultPostLoginPath, normalizePostLoginPath, pidpSingleSignOnUrl } from '../../../config/pidp'

export function UserLoginPage({ defaultNext }: { defaultNext?: string } = {}) {
  const [searchParams] = useSearchParams()
  const next = normalizePostLoginPath(searchParams.get('next') || defaultNext || defaultPostLoginPath())
  const login = pidpSingleSignOnUrl(next)
  useEffect(() => {
    document.title = 'Sign in to OrgPortal'
    window.location.replace(login)
  }, [login])
  return <section className="panel"><h1>Sign in to OrgPortal</h1><p>Opening your shared account…</p><a href={login}>Continue to sign in</a></section>
}
