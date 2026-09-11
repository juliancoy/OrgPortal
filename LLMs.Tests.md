# OrgPortal Coding Agent Tests

Use this file as the acceptance checklist for coding agents setting up or changing an organization portal. The canonical implementation guide is `docs/deployment/ORGPORTAL_AGENT_ONBOARDING.md`; the deployment model is `docs/deployment/ORGPORTAL_TENANT_DEPLOYMENT.md`.

## Agent Ground Rules

- Treat OrgPortal as one multi-tenant product. Do not add organization-specific routing, auth, event, or group systems.
- Use tenant data, organization data, and existing OrgPortal primitives before adding code.
- Use MCP tools when available. Discover the live MCP tool list first, because the server is the source of truth for the API available to the agent.
- Preview before every MCP write. Apply only after the user has approved the preview payload and the exact target organization/domain/event.
- Never commit secrets, provider keys, OAuth client credentials, or bearer tokens.

## MCP Tool Coverage

The org worker MCP server currently exposes these portal setup tools:

- `get_portal_setup`
- `save_portal_setup`
- `request_portal_custom_domain`
- `attach_portal_custom_domain`

It also exposes these event and comment tools:

- `list_events`
- `get_event`
- `get_event_operation`
- `preview_event_changes`
- `apply_event_changes`
- `preview_org_event_changes`
- `apply_org_event_changes`
- `preview_event_comments`
- `apply_event_comments`

Required OAuth scopes are `org:portal.read`, `org:portal.write`, `org:events.read`, and `org:events.write`, depending on the requested operation.

## Portal Setup Tests

- `get_portal_setup` returns the current portal state for the organization ID or slug without exposing secrets.
- `save_portal_setup` creates or updates a slug portal at `/portals/:slug`.
- The portal slug is lowercase, hyphenated, 3-64 characters, unique, and not treated as a hostname.
- Supported `homeKind` values are `default`, `landing`, `route`, `org`, `org-events`, `timebank`, and `auth`.
- The saved portal has `home_org_slug` bound to the organization slug.
- Shared slug portals retain `canonical_path_prefix: "/p"` and a `public_base_url` under `https://codecollective.us/p`.
- Attached custom domains use `canonical_path_prefix: ""` and `public_base_url: "https://<hostname>"`.
- CodeCollective remains available under `https://codecollective.us/p`.
- Tenant domains are root-mounted: `/users/login`, `/events/:slug`, `/orgs/:slug`, `/people`, `/chat`, `/org-events`, and `/timebanking`.

## Custom Domain Tests

- `request_portal_custom_domain` records the requested hostname and returns an operator checklist.
- Reserved hostnames are rejected: `codecollective.us`, `*.codecollective.us`, and `*.slug.portal.local`.
- `attach_portal_custom_domain` succeeds only after the same domain was requested or when no different request is pending.
- Attaching a domain updates `hostname`, `public_base_url`, `canonical_path_prefix`, and `custom_domain_status`.
- Public URLs generated for events, orgs, members, and login use the tenant base URL after attachment.
- `/p/users/login` on a tenant domain is not the canonical route; the canonical route is `/users/login`.

## UI Smoke Tests

- Load CodeCollective at `/p` and a tenant at `/` with the same web artifact.
- Verify favicon, manifest, service worker scope, CSS, JavaScript chunks, and image assets on both mounts.
- Verify reloads do not flash logged-out buttons for a logged-in user after session bootstrap.
- Verify login return paths from an event, comment prompt, registration flow, and header login.
- Verify mobile organization cards, group cards, org feedback, event comments, replies, and reactions.
- Verify owner/admin users do not see misleading group leave actions when membership is inferred.

## Command Checks

From `web`:

```sh
npm run test
npm run build
```

From `org-worker`:

```sh
npm run typecheck
npm test
npm run check:bundle
npm run events:check-config
```

Run live or local browser smoke checks when credentials and a safe test tenant are available. Do not stop any existing developer server to run these checks.

