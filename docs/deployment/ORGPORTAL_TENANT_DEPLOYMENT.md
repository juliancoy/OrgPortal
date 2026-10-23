# OrgPortal Tenant Deployment Model

OrgPortal uses one web application and one org worker for both the shared CodeCollective portal and organization-branded tenant domains.

Coding agents setting up an organization tenant should also follow `docs/deployment/ORGPORTAL_AGENT_ONBOARDING.md` and validate against `LLMs.Tests.md`.

## Mounts

- `codecollective.us` serves OrgPortal at `/p`.
- Tenant domains, for example `medtech.social`, serve OrgPortal at `/`.
- Organization admins configure their homepage and branding on `/orgs/:slug` before a custom domain is attached.
- Tenant routes are canonical at the tenant root: `/users/login`, `/events/:slug`, `/orgs/:slug`, `/people`, `/chat`, `/org-events`, and `/timebanking`.
- Tenant event homes use `/org-events`; compatibility aliases such as `/community` and `/medtech-events` may redirect to canonical tenant routes, but they are not the primary routing model.

The web build emits relative static asset URLs so the same artifact can load from `/p/` or `/`. Runtime routing is selected from tenant metadata returned by `/api/org/api/portal/site`; tenant hosts use a root router basename, while the shared CodeCollective host uses `/p`.

## Tenant Row

`group_sites` is the source of truth for tenant branding, routing, home behavior, and generated public URLs. Important fields:

- `organization_id`, `slug`: organization binding and internal site-configuration slug.
- `hostname`: custom domain used to resolve the tenant. Slug portals use a reserved internal hostname until an operator attaches a real domain.
- `public_base_url`: canonical public URL base. Use `https://codecollective.us/p` for CodeCollective and the root origin for tenant domains.
- `canonical_path_prefix`: `/p` for CodeCollective, empty string for root-mounted tenants.
- `profile`, `features`, `feature_config`: UI profile and enabled feature metadata.
- `brand_image_path`, `manifest_path`, `theme_color`: shell, favicon, and install metadata.
- `home_kind`, `home_path`, `home_org_slug`, `home_heading`, `home_description`, `home_*_label`, `home_*_href`, `home_image_url`: tenant home behavior.

Supported `home_kind` values are `landing`, `route`, `org`, `org-events`, `timebank`, and `auth`. `default` falls back to the configured tenant landing page for guests and `member_home_path` for signed-in members.

## Operator-Provisioned Items

For each organization tenant, operators still provision:

- Cloudflare custom domain and any DNS records.
- PIdP allowed origins and redirect/callback allowlist entries.
- MCP protected resource metadata and OAuth audience values for the public worker URL.
- Custom-domain fields on the D1 `group_sites` row and any organization seed rows referenced by `home_org_slug`.
- Provider bindings/secrets for event sources, chat, email, storage, or other enabled tenant features.

## Custom Domain Flow

1. The organization admin saves Homepage and branding on the organization dashboard; it uses the same `/orgs/:slug` page.
2. The admin enters the desired custom domain and chooses `Request Domain`. OrgPortal stores `custom_domain_status = requested` and returns the operator checklist.
3. The operator provisions Cloudflare custom domain/DNS, PIdP origins and callbacks, MCP resource metadata, and feature-provider bindings.
4. After verifying DNS ownership, HTTPS, and shared OrgPortal sign-in, an operator activates the requested domain through `POST /api/network/orgs/:organizationId/portal/custom-domain/attach`. OrgPortal updates `hostname`, `public_base_url`, and `canonical_path_prefix = ''`, then marks `custom_domain_status = attached`.
5. The custom domain becomes the canonical root-mounted tenant base for generated public URLs.

Group organizers can configure their homepage and request domains over MCP:

- `get_portal_setup`
- `save_portal_setup`
- `request_portal_custom_domain`

MCP clients need `org:portal.read` for reads and `org:portal.write` for saves and requests. Domain activation requires a platform operator through the protected REST route.

## New Tenant Checklist

1. Create or confirm the organization row and public slug.
2. Have an existing organization admin open the public org profile and save Homepage and branding; this creates the `group_sites` configuration for the existing `/orgs/:slug` page.
3. Add the Cloudflare custom domain and route it to the OrgPortal site/worker when the tenant is ready for a first-class domain.
4. Add PIdP origins/callbacks for the tenant domain.
5. Update the `group_sites` row with `hostname`, `public_base_url`, root `canonical_path_prefix`, brand assets, features, and home settings.
6. Configure MCP resource metadata and provider bindings for enabled integrations.
7. Verify the organization homepage and Branding tab, then verify `/`, `/users/login`, `/people`, `/orgs/:slug`, `/events`, `/org-events`, favicon, manifest, CSS, JS chunks, and service worker registration on the tenant domain.
8. Verify `https://codecollective.us/p` behavior still works after deploying the same web artifact.
