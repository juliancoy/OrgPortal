import { Link, useLocation } from 'react-router-dom'

export function SignInLink() {
  const location = useLocation()
  return <Link to={`/users/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`}>Sign in</Link>
}
