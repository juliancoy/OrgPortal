import { UserLoginPage } from '../users/UserLoginPage'

// Organization membership and creation happen after shared account sign-in.
export function OrgRegisterPage() {
  return <UserLoginPage defaultNext="/orgs/initiatives" />
}
