import { Link } from 'react-router-dom'
import { pidpUrl } from '../../config/pidp'

export function DevToolsPage() {
  const origin = window.location.origin
  const orgApiBase = `${origin}/api/org`
  const mcpEndpoint = `${origin}/api/org/mcp`
  const pidpBase = pidpUrl('/')

  return (
    <section className="panel">
      <h1 style={{ marginTop: 0 }}>Dev Tools</h1>
      <p className="muted">Developer links, auth helpers, and integration endpoints.</p>

      <h2>MCP</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Org MCP endpoint (streamable HTTP):
      </p>
      <code>{mcpEndpoint}</code>
      <p className="muted">Use a profile PAT in `ORG_PAT`, `ORG_MCP_PAT`, or `PIDP_PAT`.</p>

      <h2>API Keys</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Create and manage profile-scoped service tokens in PIdP:
      </p>
      <ul style={{ paddingLeft: '1.2rem' }}>
        <li>
          <a href={`${pidpBase}profile`} rel="noreferrer">
            PIdP Profile Tokens
          </a>
        </li>
        <li>
          <code>POST /auth/tokens</code> create token
        </li>
        <li>
          <code>GET /auth/tokens</code> list tokens
        </li>
        <li>
          <code>POST /auth/tokens/:id/cycle</code> rotate token
        </li>
        <li>
          <code>DELETE /auth/tokens/:id</code> revoke token
        </li>
      </ul>

      <h2>Org API</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Base URL:
      </p>
      <code>{orgApiBase}</code>
      <ul style={{ paddingLeft: '1.2rem' }}>
        <li>
          <code>/health</code>
        </li>
        <li>
          <code>/admin/me</code>
        </li>
        <li>
          <code>/api/network/chat/bootstrap</code>
        </li>
        <li>
          <code>/api/network/events/public</code>
        </li>
      </ul>

      <h2>Quick Links</h2>
      <ul style={{ paddingLeft: '1.2rem' }}>
        <li>
          <Link to="/tools/business-cards">Business Card Intake</Link>
        </li>
        <li>
          <Link to="/admin">Admin</Link>
        </li>
        <li>
          <Link to="/chat">Chat</Link>
        </li>
        <li>
          <a href={pidpBase} rel="noreferrer">
            Identity (PIdP)
          </a>
        </li>
      </ul>
    </section>
  )
}
