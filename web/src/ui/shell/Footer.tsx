import { pidpUrl } from '../../config/pidp'

function androidApkUrl() {
  if (typeof window === 'undefined') return 'https://static.arkavo.org/app-release.apk'
  const host = window.location.hostname.toLowerCase()
  const match = host.match(/^(?:dev\.)?portal\.(.+)$/)
  if (match?.[1]) return `https://static.${match[1]}/app-release.apk`
  if (host === 'localhost' || host === '127.0.0.1') return '/app-release.apk'
  return 'https://static.arkavo.org/app-release.apk'
}

export function Footer() {
  const apkUrl = androidApkUrl()
  return (
    <footer className="portal-footer">
      <div className="portal-footer-inner">
        <div>
          <div className="portal-brand-title">Code Collective</div>
          <div className="portal-brand-sub">Civic governance, transparently.</div>
        </div>
        <div className="portal-footer-links">
          <a href="/governance">Governance</a>
          <a href="/users/dashboard">Initiatives</a>
          <a href="/ecops">Finance</a>
          <a href="/send">Send</a>
          <a href="/receive">Receive</a>
          <a href="/create">Create</a>
          <a href="/about">About</a>
          <a href={pidpUrl('/')}>Identity</a>
          <a href={apkUrl} target="_blank" rel="noreferrer">Android APK</a>
        </div>
        <span>© 2026 Code Collective</span>
      </div>
    </footer>
  )
}
