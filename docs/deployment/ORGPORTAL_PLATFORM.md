# OrgPortal platform

`https://orgportal.cc/` is the neutral platform entry point. The `orgportal`
portal tenant has no organization owner or Timebank community. Its public
homepage, community picker, organization directory, and sign-in use the
`orgportal` branding profile. Code Collective remains a separate community at
`https://codecollective.us/p/`.

Community selection opens the community's configured public portal. Attached
custom domains take precedence over slug portals; pending domains do not.
The community directory exposes public names, taglines, features, and safe HTTPS
destinations, never internal configuration, domain notes, or permissions.
Timebank links on the platform lead to a community picker. The platform hostname
must not silently select Code Collective's board or ledger.

## Accounts

PIdP continues to own credentials, sessions, provider callbacks, and account
linking. The registered member application is displayed as OrgPortal but retains
its existing ID and `code-collective` slug. That slug is an internal compatibility
identifier, not community membership. Renaming it or creating a replacement
application would create a new account namespace and is not part of this change.
Sign-in defaults to `/communities`; validated explicit return paths are preserved.
OrgPortal continues to check current organization membership and permissions.
Opening or signing in to the platform grants no community membership or role.

PIdP remains hosted at `id.codecollective.us`; server hosting, issuer keys, and
account storage remain shared. Neutral product identity does not require an
independent identity issuer or frontend Worker.

## Release

Apply only the reviewed migrations:

- OrgPortal `0074_orgportal_platform.sql` removes the prior Code Collective
  domain attachment and seeds the platform tenant. It leaves organizations,
  memberships, accounts, community IDs, and ledger tables unchanged.
- PIdP `0011_orgportal_application.sql` changes the registered application's
  display name and adds `orgportal.cc` to its login hosts and return origins.
  It preserves the application ID, slug, existing hosts, and account records.

Shared frontend and org releases continue through CodeCollective. Keep
`orgportal.cc` in the frontend custom domains and tenant-host configuration,
PIdP portal authentication origins, and chat origins. Deployment defaults use
OrgPortal for public links and the shared identity display name. Tenant-specific
public base URLs remain authoritative.

The platform has its own `orgportal.webmanifest` and vector mark. Existing
community manifests and branding remain available on their domains.

Validate the neutral homepage, community search, Timebank picker, sign-in return
paths, community domains, and static assets. Authenticated browser tests use only
isolated local sessions or local fixtures; production checks are unauthenticated.
Journal tests count scenario writes relative to audited migration seed entries,
so initial platform configuration remains in immutable deployment history.

## ChatGPT MCP connection

Connect ChatGPT to `https://orgportal.cc/api/org/mcp` using OAuth. The platform
resource has no fixed organization; live membership and operation permissions
still apply. MedTech and LifeTech retain their separate organization resources.

`org-worker/config/mcp-resources.json` and the Worker deployment variable
`MCP_RESOURCE_CONFIG_JSON` include the platform resource. Its dedicated
`MCP_ORGPORTAL_INTROSPECTION_SECRET` is provisioned in Cloudflare. PIdP's
`MCP_OAUTH_RESOURCE_CONFIG_JSON` adds its credential hash and OrgPortal login
handoff without replacing existing secret resource additions or signing keys.
