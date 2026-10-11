# OrgPortal identity integration

PIdP owns credentials, social sign-in, account linking, sessions and OAuth.
OrgPortal owns tenants, organization memberships, roles, invitations and domain
permissions. CodeCollective is the shared deployment host and does not choose
OrgPortal identity or login destinations.

PIdP's normative registration and return contract is documented in the sibling
[PIdP identity boundary specification](../../PIdP/docs/PORTAL_IDENTITY_BOUNDARIES.md).
Its shared portal registry separates product origin and display name from account
namespace. The historical `code-collective` namespace remains to preserve existing
credentials; it is not the portal brand or return destination.

OrgPortal starts browser sign-in through its same-origin `/pidp/auth/sso/start`
proxy. PIdP validates the portal registration and saved return path, authenticates
in the registered namespace, then hands a one-use browser-bound code back to the
same portal. OrgPortal's callback resumes the requested local page. Tenant
session cookies are host-only. An OrgPortal sign-in must not land on the retired
CodeCollective `/p/` mount.

PIdP renders authentication and account-linking UI using a trusted registration
or live SSO ticket. OrgPortal continues to own product branding and navigation;
operators register that branding with PIdP. Linking requires both sign-ins and
explicit confirmation. OAuth consent and an identity link do not grant an
organization role. MCP authority uses live PIdP introspection plus OrgPortal's
scope and domain-permission checks, and mutation receipts where required.

When adding a portal, configure its product identity in OrgPortal, register its
origin/name/account namespace/callbacks in PIdP, and include the origin in the
PIdP transport allowlist. Validate sign-in, linking, return routing and host-only
cookies with isolated local accounts before release. Deploy shared OrgPortal
services through CodeCollective and PIdP separately.
