# OrgPortal Tenant Deployment Model

OrgPortal uses one web application and one org worker for both the shared CodeCollective portal and organization-branded tenant domains.

## Mounts

- `codecollective.us` serves OrgPortal at `/p`.
- Tenant domains, for example `medtech.social`, serve OrgPortal at `/`.
- Organization admins can publish a shared slug portal at `/portals/:slug` before a custom domain is attached.
- Tenant routes are canonical at the tenant root: `/users/login`, `/events/:slug`, `/orgs/:slug`, `/people`, `/chat`, `/org-events`, and `/timebanking`.
- Tenant event homes use `/org-events`; tenant-specific legacy aliases are not part of the routing model.

The web build emits relative static asset URLs so the same artifact can load from `/p/` or `/`. Runtime routing is selected from tenant metadata returned by `/api/org/api/portal/tenant`; tenant hosts use a root router basename, while the shared CodeCollective host uses `/p`.

## Tenant Row

`portal_tenants` is the source of truth for tenant branding, routing, home behavior, and generated public URLs. Important fields:

- `organization_id`, `slug`: optional organization link and shared slug URL for admin-created portals.
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
- Custom-domain fields on the D1 `portal_tenants` row and any organization seed rows referenced by `home_org_slug`.
- Provider bindings/secrets for event sources, chat, email, storage, or other enabled tenant features.

## New Tenant Checklist

1. Create or confirm the organization row and public slug.
2. Have an existing organization admin open the public org profile and save the Portal panel; this creates the `portal_tenants` row and shared `/portals/:slug` URL.
3. Add the Cloudflare custom domain and route it to the OrgPortal site/worker when the tenant is ready for a first-class domain.
4. Add PIdP origins/callbacks for the tenant domain.
5. Update the `portal_tenants` row with `hostname`, `public_base_url`, root `canonical_path_prefix`, brand assets, features, and home settings.
6. Configure MCP resource metadata and provider bindings for enabled integrations.
7. Verify `/portals/:slug`, then verify `/`, `/users/login`, `/people`, `/orgs/:slug`, `/events`, `/org-events`, favicon, manifest, CSS, JS chunks, and service worker registration on the tenant domain.
8. Verify `https://codecollective.us/p` behavior still works after deploying the same web artifact.
