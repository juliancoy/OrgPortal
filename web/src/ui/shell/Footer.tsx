import { pidpUrl } from '../../config/pidp'

export function Footer() {
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
          <a href="/finance">Finance</a>
          <a href="/send">Send</a>
          <a href="/receive">Receive</a>
          <a href="/create">Create</a>
          <a href="/about">About</a>
          <a href={pidpUrl('/')}>Identity</a>
        </div>
        <span>© 2026 Code Collective</span>
      </div>
    </footer>
  )
}
