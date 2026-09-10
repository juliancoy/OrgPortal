# OrgPortal Agent Onboarding

This guide is for people using coding agents to set up an organization-branded OrgPortal tenant. It covers the MCP server API where available and the operator work that still happens outside MCP.

## Model

OrgPortal has one web app and one org worker. CodeCollective is mounted at `https://codecollective.us/p`; organization tenant domains are mounted at their root, for example `https://medtech.social/users/login`.

Do not build a parallel portal for a new organization. A tenant is data in `portal_tenants`, connected to an existing `organizations` row and the existing event, member, group, chat, and auth systems.

## Agent Workflow

1. Confirm the user is an owner or administrator for the organization.
2. Discover the MCP server tools and scopes from the live connection.
3. Read the current setup with `get_portal_setup`.
4. Save the slug portal with `save_portal_setup`.
5. Request the custom domain with `request_portal_custom_domain`.
6. Hand the returned checklist to the operator.
7. After Cloudflare, PIdP, MCP metadata, and providers are provisioned, attach the domain with `attach_portal_custom_domain`.
8. Run the checks in `LLMs.Tests.md`.

Every MCP write should be treated as an approved operation. Show the preview or current state to the user before applying a change that affects public URLs, events, comments, or provider integrations.

## Portal MCP Payloads

Read the current setup:

```json
{
  "organizationId": "baltimore-medtech"
}
```

Create or update the slug portal:

```json
{
  "organizationId": "baltimore-medtech",
  "slug": "baltimore-medtech",
  "name": "Baltimore MedTech",
  "tagline": "A portal for Baltimore's medical technology community.",
  "accentColor": "#155e59",
  "features": ["directory", "events", "chat", "groups"],
  "homeKind": "org-events",
  "homeHeading": "Baltimore MedTech",
  "homeDescription": "Events, people, and working groups for Baltimore's medical technology community.",
  "homeImageUrl": "https://example.com/approved-image.jpg"
}
```

Request a custom domain:

```json
{
  "organizationId": "baltimore-medtech",
  "hostname": "medtech.social",
  "notes": "Requested by the organization admin after approving the slug portal."
}
```

Attach a provisioned custom domain:

```json
{
  "organizationId": "baltimore-medtech",
  "hostname": "medtech.social",
  "notes": "Cloudflare custom domain, PIdP origins, MCP metadata, and provider bindings are complete."
}
```

## Tenant Fields

The tenant row is the source of truth for branding, routing, home behavior, and public URL generation:

- `organization_id` links the tenant to an organization.
- `slug` publishes the shared slug portal at `/portals/:slug`.
- `hostname` resolves an attached first-class custom domain.
- `public_base_url` is the canonical base for generated public links.
- `canonical_path_prefix` is `/p` for CodeCollective and empty for root-mounted tenant domains.
- `profile`, `features`, and `feature_config` drive available UI surfaces.
- `brand_image_path`, `manifest_path`, and `theme_color` drive shell and install metadata.
- `home_kind`, `home_path`, `home_org_slug`, `home_heading`, `home_description`, `home_primary_label`, `home_primary_href`, `home_secondary_label`, `home_secondary_href`, and `home_image_url` drive the home page.

Supported home modes are `default`, `landing`, `route`, `org`, `org-events`, `timebank`, and `auth`.

## Event And Comment MCP

Use native OrgPortal event tools when OrgPortal is the event system of record:

- Preview with `preview_org_event_changes`.
- Apply with `apply_org_event_changes` after the user approves the preview and supplies the matching `previewId`.

Use provider event tools only for configured external calendars:

- Preview with `preview_event_changes`.
- Apply with `apply_event_changes` after approval.
- Inspect uncertain writes with `get_event_operation`.

Enable public event comments by attaching an existing native chat conversation:

```json
{
  "organizationId": "baltimore-medtech",
  "eventSlug": "medtech-in-the-hut",
  "conversationId": "EVENT_CONVERSATION_ID",
  "roomName": "Event comments",
  "confirm": false
}
```

Apply with the same payload plus `confirm: true` and the returned `previewId`. Comments use the existing OrgPortal chat/comment primitives, including replies and reactions where enabled by the web UI and chat backend.

## Operator-Provisioned Work

MCP can create the slug portal, record the domain request, attach the provisioned domain, manage native events, and enable event comments. Operators still provision:

- Cloudflare custom domain, DNS, route, and deployment binding.
- PIdP allowed origins, redirect URIs, and callback allowlist entries.
- MCP protected-resource metadata and OAuth audience values for the public worker URL.
- D1 migrations and tenant rows when bootstrapping older environments.
- Provider bindings and secrets for external calendars, email, chat, storage, or other integrations.

Do not paste secrets into an agent chat. Configure secrets through the deployment environment or secret manager.

## New Organization Checklist

1. Confirm organization row, slug, public profile, and at least one active owner/admin.
2. Save the portal setup through MCP or the admin UI.
3. Verify `/portals/:slug` on `https://codecollective.us/p`.
4. Request the desired custom domain.
5. Complete the operator checklist returned by MCP.
6. Attach the provisioned custom domain.
7. Verify tenant root routes, login return URLs, generated public event/org/member URLs, assets, service worker, favicon, and manifest.
8. Verify organization-specific surfaces: home, events, people, groups, chat, feedback, registration, and event comments.
9. Re-run CodeCollective `/p` checks so shared production behavior remains intact.

## References

- `LLMs.Tests.md`
- `docs/deployment/ORGPORTAL_TENANT_DEPLOYMENT.md`
- `docs/deployment/EVENTS_MCP.md`
- `pidp/serverless/MCP_AUTHORIZATION.md`

