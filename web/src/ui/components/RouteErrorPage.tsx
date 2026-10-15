export function RouteErrorPage() {
  return <main className="portal-container" role="alert">
    <h1>This page could not load</h1>
    <p>The site may have updated while this tab was open. Reload to try again.</p>
    <button type="button" onClick={() => window.location.reload()}>Reload page</button>
    <p><a href="/">Go home</a></p>
  </main>
}
