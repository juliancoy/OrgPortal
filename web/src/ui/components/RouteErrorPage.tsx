import './recovery.css'

export function RouteErrorPage() {
  return <main className="portal-recovery" role="alert">
    <p className="recovery-label">OrgPortal · Page unavailable</p>
    <h1>This page could not load</h1>
    <p>The site may have updated while this tab was open. Reload to try again.</p>
    <div className="recovery-actions"><button className="btn-primary" type="button" onClick={() => window.location.reload()}>Reload page</button>
    <a href="/">Go home</a></div>
  </main>
}
