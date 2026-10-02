# Route Contract

OrgPortal is a shared portal application. The same router serves the main
Code Collective portal and tenant-root domains such as `medtech.social`.
Routes must therefore distinguish between canonical tenant experiences,
shared public routes, authenticated member tools, and legacy aliases.

The implementation lives in `web/src/ui/router/createAppRouter.tsx`.

## Principles

- Tenant-root domains own `/`. A tenant such as Baltimore MedTech should feel
  like the host organization owns the base domain, not like it is embedded in a
  separate generic community area.
- Public visitors see public content first: landing pages, events, profiles,
  calendar views, search, login, and join entry points.
- Authenticated members may see member tools such as chat, settings, MCP
  connect, account views, calendar integrations, and admin workflows.
- Admin routes must verify permissions through OrgPortal APIs; authentication
  alone is not administrator access.
- Legacy URLs should redirect to canonical routes instead of creating duplicate
  public surfaces.
- Route decisions should use tenant metadata and portal profile helpers rather
  than hard-coded tenant exceptions wherever practical.

## Mounting

| Context | Base path | Behavior |
| --- | --- | --- |
| Main Code Collective portal | `/p` in production, or configured `VITE_PORTAL_MOUNT_PATH` | Shared portal routes live under the configured portal mount. |
| Tenant-root domain with empty `canonical_path_prefix` | `/` | The tenant receives the domain root as its canonical portal surface. |
| Tenant preview route | `/portals/:tenantSlug` | Loads a tenant profile by slug without requiring a custom domain. |

`portalBasePath()` and `portalProfilePath()` normalize links so tenant-root
domains do not leak `/p` into first-party navigation.

## Tenant Home

`/` is resolved by `HomeRoute`.

| Tenant state | Guest behavior | Member behavior |
| --- | --- | --- |
| `home_kind=landing` or `main` | Tenant landing page | Tenant landing page |
| `home_kind=org-events` with `home_org_slug` | Hosted events home | Hosted events home |
| `home_kind=timebank` | Timebank home | Timebank home |
| `home_kind=auth` | `/users/login` | Tenant member home path |
| `home_kind=route` with safe internal `home_path` | Redirect to that path | Redirect to that path |
| Default tenant | Tenant landing page | Tenant member home path |
| No tenant | Public Code Collective app | `/chat` |

For `medtech.social`, the professional target shape is that `/` belongs to the
host organization and its selected tenant home. The site should not expose a
separate "Community" landing page as the primary MedTech experience.

## Canonical Public Routes

| Route | Purpose | Tenant-root behavior |
| --- | --- | --- |
| `/` | Tenant home or main portal home | Tenant owns this route. |
| `/events` | Public event listing | On tenant domains with `home_org_slug`, shows hosted tenant events. |
| `/events/:slug` | Public event detail and registration | Shared detail route, branded by active tenant when present. |
| `/org-events` | Hosted organization events | On tenants with `home_org_slug`, shows hosted tenant events. Else falls back to public events. |
| `/calendar` | Public calendar | Public. |
| `/orgs` | Public organization directory | Public shared route. |
| `/orgs/:handle` | Public organization profile | Public shared route. |
| `/people` | Public people directory | Public shared route. |
| `/users/:slug` | Public member profile | Public shared route. |
| `/search` | Global search | Public shared route. |
| `/about` | Portal about page | Public shared route, branded by profile. |
| `/terms` and `/legal` | Legal terms | Public shared route, branded by profile. |

## Tenant Aliases

| Route | Canonical destination |
| --- | --- |
| `/community` on tenant domains with `home_org_slug` | `/` |
| `/community` on tenant domains without `home_org_slug` | `/people` |
| `/community` without a tenant | `/orgs` |
| `/medtech-events` on tenant domains | `/org-events` |
| `/medtech-events` without a tenant | `/events` |
| `/index.html` | `/` |
| `/calendar.html` | `/calendar` |

These aliases exist for continuity only. New navigation should link to the
canonical destination, not to the alias.

## Authenticated Member Routes

These routes require a portal member session through `AuthenticatedRoute`.
Guests are redirected to `/users/login?next=...`.

| Route | Purpose |
| --- | --- |
| `/profile` | Current member public/contact profile editor. |
| `/settings` | Member settings. |
| `/id` | Member identity view. |
| `/calendar/integrations` | Personal calendar integrations. |
| `/users/mcp-connect` | MCP account confirmation and connection. |
| `/chat` | Member chat. |
| `/chat/:roomId` | Member chat room. |
| `/dev-tools` | Authenticated development tools. |
| `/life-insurance` | Authenticated feature workflow. |
| `/health-insurance` | Authenticated feature workflow. |
| `/provider-scheduling` | Authenticated feature workflow. |
| `/property-casualty-insurance` | Authenticated feature workflow. |

## Authentication Entry Points

| Route | Purpose |
| --- | --- |
| `/users/login` | Canonical branded portal login entry. |
| `/users/register` | Redirects to `/users/login`; account creation is handled by the login/PIdP flow. |
| `/auth/callback` | Authentication callback route. |

PIdP owns credentials and issuer sessions. OrgPortal owns tenant branding,
post-login routing, membership checks, and permission checks.

## Organization Member Routes

These are app/workflow routes for organization users. Public organization
profiles remain under `/orgs/:handle`.

| Route | Purpose |
| --- | --- |
| `/orgs/register` | Organization registration. |
| `/orgs/login` | Organization login entry. |
| `/orgs/profile` | Organization profile management. |
| `/orgs/account` | Organization account management. |
| `/orgs/events` | Organization event administration. |
| `/orgs/initiatives` | Organization initiatives. |
| `/orgs/initiatives/editable` | Editable organization initiatives. |
| `/orgs/initiatives/new` | New initiative editor. |
| `/orgs/initiatives/:id/edit` | Initiative editor. |
| `/orgs/initiatives/:id/ballot` | Initiative ballot flow. |

## Admin Routes

These routes require `AdminRoute`, which checks `/api/org/admin/me`.

| Route | Purpose |
| --- | --- |
| `/admin` | System administration. |
| `/email` | Email campaign administration. |
| `/admin/ubi-settings` | UBI settings; also gated by the `ubi` feature flag. |

## Feature-Gated Routes

`FeatureRoute` hides disabled tenant features by returning the not-found page.
Today this is used for `/admin/ubi-settings` via the `ubi` feature flag.

## Timebank Routes

| Route | Purpose |
| --- | --- |
| `/timebanking` | Timebank page on the shared portal. |
| `/` on a `timebank` tenant | Tenant timebank home. |

Timebank tenant domains should feel like the timebank application, not like a
generic directory with timebank content nested inside it.

## Governance Routes

| Route | Purpose |
| --- | --- |
| `/governance` | Motion list. |
| `/governance/propose` | Propose a motion. |
| `/governance/:id` | Motion detail. |
| `/governance/:id/amend` | Propose an amendment. |
| `/governance/roberts` | Roberts-rules motion list alias. |
| `/governance/roberts/propose` | Roberts-rules propose alias. |
| `/governance/roberts/:id` | Roberts-rules motion detail alias. |
| `/governance/roberts/:id/amend` | Roberts-rules amendment alias. |

## Legacy User Aliases

| Route | Canonical destination |
| --- | --- |
| `/users/profile` | `/profile` |
| `/users/account` | `/profile` |
| `/constituent` | `/users/dashboard` |
| `/constituent/dashboard` | `/users/dashboard` |
| `/constituent/profile` | `/profile` |
| `/constituent/account` | `/profile` |
| `/constituent/login` | `/users/login` |
| `/constituent/register` | `/users/login` |
| `/contact/:slug` | `/users/:slug` |
| `/contact-settings` | `/profile` |

## Non-Tenant Shared Routes

These remain shared Code Collective routes unless a tenant explicitly chooses
one through `home_kind=route` or direct navigation.

| Route | Purpose |
| --- | --- |
| `/finance` | Economic operations. |
| `/ecops` | Redirects to `/finance`. |
| `/departments` | Departments. |
| `/send` | Send workflow. |
| `/receive` | Receive workflow. |
| `/create` | Create workflow. |
| `/create/for-profit` | For-profit create workflow. |
| `/create/non-profit` | Non-profit create workflow. |
| `/initiatives/:slug` | Public initiative detail. |
| `/initiatives/:slug/sign` | Initiative signing. |
| `/resources` | Tenant resources; redirects home when no tenant is active. |
| `/android/install` | Android install instructions. |
| `/tools/business-cards` | Business card intake. |
| `/targets/:target` | Target page. |

## Adding Or Changing Routes

Before adding a route:

1. Decide whether it is public, authenticated, admin-only, tenant-only, or a
   legacy alias.
2. Add tenant-root behavior deliberately. A route that makes sense on
   `codecollective.us/p/...` may be confusing on a tenant's base domain.
3. Prefer one canonical URL and redirect aliases.
4. Use `portalProfilePath()` for internal links that should work under both
   mounted and tenant-root deployments.
5. Preserve PIdP and OrgPortal boundaries: PIdP authenticates identity;
   OrgPortal decides membership, tenant navigation, and authorization.
6. Update this file and route tests when changing canonical behavior.

## Current Assessment

The current shape is appropriate for MedTech: the host organization owns the
base domain, `/community` is no longer a competing MedTech destination, and
`/events` resolves to the tenant's hosted events on tenant-root domains.

The main remaining professional-risk area is not the URL shape itself; it is
keeping tenant intent centralized. Future tenant-specific behavior should come
from tenant metadata and route helpers, not new hard-coded special cases.
