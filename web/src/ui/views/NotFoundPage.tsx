import '../components/recovery.css'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="portal-recovery">
      <p className="recovery-label">Error 404</p>
      <h1>Page not found</h1>
      <p className="muted">The page you’re looking for does not exist.</p>
      <div className="recovery-actions"><Link className="btn-primary" to="/">Go home</Link><Link to="/orgs">Browse groups</Link></div>
    </section>
  )
}
