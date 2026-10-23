# One organization homepage

The public homepage is `/orgs/:organizationSlug`. It includes configured welcome
copy and actions, the organization description and image, every upcoming hosted
event, specialty resources, and Info/Board/Personnel/Branding tabs. Branding uses
`?tab=branding`; management stays at `/orgs/:organizationSlug/dashboard`.
The page stays public regardless of sign-in status, with permission-checked
management controls added for managers.

The retired portal-page namespace has no app routes or redirects and returns
HTTP 404 at the web Worker. Stored old homepage paths are normalized to the
linked organization's slug when read, rather than emitted in navigation, public
community listings, API setup responses or MCP setup responses. Historical SQL
migrations remain immutable. No organization records, memberships or identities
are merged, and no new data store or migration is needed for this URL change.

The internal `group_sites.slug` can differ from `organizations.slug`; it remains
site configuration, not another public page. Explicit organization binding wins
over historical slug hints, including after renames. Unlinked sites do not get a
fabricated organization destination. Custom-domain provisioning and identity
interfaces remain separate.

Public homepage configuration uses the same curated projection as Branding and
does not set global tenant context. Private provisioning settings are excluded.
Configured actions and resources are restricted to safe HTTP(S) destinations;
retired resource links are omitted. The hosted-event loader paginates instead of
truncating the list. Site-wide and per-organization statistics do not count API
reads or tab changes as additional organization-page entries.

Tests include canonical-URL/tenant/API/edge checks and the isolated Docker
clickthrough `web/scripts/test-local-unified-organization.py` plus the existing
local Branding test. The real fixture uses an organization and a differently
named site, four hosted events, and an unrelated organization's event.
