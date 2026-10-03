import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'

export function OrganizationTools() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <nav aria-label="Organization tools" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
      <Link className="btn-secondary" to="/governance">Governance</Link>
      <Link className="btn-secondary" to="/governance/roberts">Robert’s Rules</Link>
      <Link className="btn-secondary" to="/orgs/initiatives">Initiatives</Link>
      <Link className="btn-secondary" to="/orgs/events/venues">Venues</Link>
      <Link className="btn-secondary" to="/availability">When I Meet</Link>
    </nav>
  )
}
