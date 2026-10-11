# OrgPortal groups and identity

OrgPortal is one application. A person signs in once and participates in many
groups. A group is an organization record, not an identity tenant. Memberships
and roles attach the person's stable account ID to an organization ID. PIdP
provides authentication; OrgPortal decides access on every request.

The access model has three group roles: owner, organizer (`administrator` in
storage), and member. Owners and organizers manage only their groups. Members
can access their group's member functionality. A platform operator is a separate
system authority supplied by PIdP, never by group branding, email matching,
OAuth consent, or a custom hostname. Existing onboarding requirements continue
to gate organizer activation where configured for the group.

## Group homepages

`/orgs/:slug` is the group profile and management page. It stays reachable and
does not redirect to another domain. Its `group_home_url` links to the group's
branded public homepage. An attached custom domain takes precedence over the
configured homepage or `/portals/:slug` URL. A pending domain is not a homepage.

Branding and domains are presentation configuration for the same group. They
do not create accounts, credential stores, OAuth clients, or permission scopes.
`group_sites` holds site configuration. Site-linked workflow columns use
`group_site_id`, including onboarding, tasks, photos, and meeting preferences.
Migration `0083_group_sites.sql` renames the tables and columns in place, updates
foreign keys and journal triggers, and keeps immutable historical journal entries
unchanged. The site discovery API is `/api/portal/site`.

## One login across domains

Every group uses the shared PIdP application slug `orgportal`. Its stable
application ID and member subjects remain the same when the slug is renamed.
The browser starts sign-in through the current site's `/pidp/auth/sso/start`,
visits the central issuer, and returns through a short-lived, one-use,
browser-bound handoff. Each domain gets its own secure host-only session cookie.
The central issuer session lets a person continue to another group without
entering credentials again. Cross-domain cookies are not required.

Redirect destinations must be registered explicitly and validated. Never derive
allowed authentication origins from a submitted custom domain. OAuth resource
audiences remain bound to the requested API; sharing a login does not grant
access to another resource or group.

## Domain activation

A group organizer requests a domain. A platform operator verifies ownership,
provisions routing and HTTPS, adds the exact origin to the shared application's
login hosts, redirect origins, and PIdP SSO origin allowlist, and verifies the
sign-in handoff before activating the requested domain. The attach API requires
operator authority and a matching pending request. Provisioning remains an
operator workflow; saving a request does not provision DNS or certificates.

## Release order

Apply PIdP `0012_orgportal_login.sql` to the serverless identity database, or run
`scripts/migrate_orgportal_login.py` for the Python database. Both rename the
existing registration in place. Do not create a replacement application.
Set `PORTAL_SSO_APP_SLUG=orgportal`, build the frontend with
`VITE_PIDP_APP_SLUG=orgportal`, and update any explicit deployment overrides in
the same release window. Existing defaults now use `orgportal`; old slug login
requests are not supported. Release shared portal assets through CodeCollective
and PIdP separately. Validate browser SSO locally before deploying.
