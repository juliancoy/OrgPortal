# One organization homepage

The public homepage is `/orgs/:organizationSlug`. It includes configured welcome
copy and actions, the organization description and image, every upcoming hosted
event, specialty resources, and Info/Board/Personnel/Poster/Branding tabs. Branding uses
`?tab=branding`; management stays at `/orgs/:organizationSlug/dashboard`.
The page uses the same public appearance and tabs for every account. Management
controls, statistics, branding edits, embedded group chat and member tools are
available on the explicit workspace at `/orgs/:organizationSlug/dashboard`, with
live membership and management checks. There is no class-relative appearance,
"View as" control, saved audience, or role-based landing redirect. Legacy
`public`, `attendee`, and `volunteer` bookmarks redirect to the public profile;
legacy `member` and `organizer` bookmarks redirect to the workspace. A `view`
query parameter does not change the public profile.

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

The **Poster** tab at `/orgs/:slug?tab=poster` shares the event poster editor:
print formats, light/dark themes, solid/gradient or organization-gallery
backgrounds, editable canvas elements, PNG/SVG export and printing. Its optional
upcoming-event list contains every upcoming event hosted by this organization,
including events already underway. Past events and events merely associated
with its calendar are excluded. Long lists continue across numbered poster
pages; downloads export the selected page and **Print all pages** prints the
complete list. Poster preferences are browser-local and separate from event
poster preferences and other organizations.

The public API serves `/api/network/orgs/public/:slug/poster-images` and
`/api/network/orgs/public/:slug/flyer.svg`. The latter accepts `format`, `theme`,
`background`, server-catalog `mediaId`, `link`, `includeEvents=true`, and `page`.
It reports `X-Poster-Pages`, `X-Poster-Page`, and `X-Poster-Events` and uses
`Cache-Control: no-store` so event updates appear on the next poster request.
Gallery files remain organization-scoped; the endpoint accepts no arbitrary
image URL. No database migration is required.

Public link generation treats a configured organization homepage as a destination,
not as an application routing prefix. Organization and event links keep the real
site mount and never nest below another organization’s URL.
