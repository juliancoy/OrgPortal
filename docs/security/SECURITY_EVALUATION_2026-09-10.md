# Security Evaluation - 2026-09-10

Scope: OrgPortal web app and edge worker, org-worker, chat-worker, PIdP serverless worker, MCP event/portal APIs, tenant routing, and deployment configuration present in this workspace.

## Executive Summary

No critical runtime dependency advisories remain after this pass. The main code hardening applied here was tightening the web edge worker's proxied API CORS behavior from wildcard to same-origin or explicitly configured origins. Worker package dependencies were also updated to remove Hono runtime advisories and Wrangler dev-tool advisories.

The highest remaining security work is operational: production secret rotation policy, explicit tenant-origin allowlists for every deployed domain, rate-limit policy at the edge, and a browser-based smoke pass for auth/session behavior on each tenant domain.

## Fixed In This Pass

- Updated `hono` in `org-worker`, `chat-worker`, and `pidp/serverless` to a fixed range.
- Updated `wrangler` in `org-worker`, `chat-worker`, and `pidp/serverless` to clear vulnerable `miniflare`/`sharp` dev-tool advisories.
- Updated PIdP serverless Workers types to satisfy the latest Wrangler peer requirement.
- Tightened `web/cloudflare/worker.js` CORS for `/api/org`, `/api/governance`, and `/pidp` proxy paths:
  - Same-origin requests are allowed.
  - Additional origins must be listed in `PORTAL_ALLOWED_ORIGINS` or `WEB_ALLOWED_ORIGINS`.
  - Unknown browser origins receive `403` on preflight.
  - Proxied responses no longer emit wildcard CORS headers by default.
- Added unit coverage for the edge CORS behavior.

## Checks Run

- `npm audit --omit=dev --json` in `web`
- `npm audit --json` in `web`
- `npm audit --json` in `org-worker`
- `npm audit --json` in `chat-worker`
- `npm audit --json` in `pidp/serverless`
- `npm run typecheck` in `org-worker`
- `npm test -- event-platforms.test.ts mcp-setup.test.ts event-safety.test.ts org-worker.test.ts` in `org-worker`
- `npm run check:bundle` in `org-worker`
- `npm run typecheck && npm test` in `chat-worker`
- `npm run typecheck && npm test` in `pidp/serverless`
- `npm run test:worker` in `web`
- `npm run build` in `web`
- `git diff --check`

## Dependency Posture

- `web` production dependencies: clean.
- `org-worker`: clean after updates.
- `chat-worker`: clean after updates.
- `pidp/serverless`: clean after updates.
- `web` dev dependencies still report advisories in `vitest`, `@xmldom/xmldom`, and `js-yaml`. They are not production runtime dependencies in this app. An attempted direct update failed with npm's internal `Cannot read properties of null (reading 'edgesOut')` error before writing changes. Revisit with a clean npm install or package-manager upgrade.

## Reviewed Security Properties

- MCP OAuth is audience-bound, scope-bound, issuer-checked, and fails closed on invalid configuration or introspection outage.
- MCP write tools require organization management access in addition to OAuth scopes.
- MCP write tools use preview IDs bound to actor, organization, event, content fingerprint, and expiry.
- Event comment configuration uses existing native chat conversations rather than introducing a parallel comment store.
- OrgPortal public URLs are generated through tenant-aware backend helpers.
- D1 queries reviewed in the critical paths use prepared statements and `.bind()`.
- React renders user content as text in reviewed paths; explicit HTML injection is limited to QR SVG rendering and sandboxed email preview HTML.
- PIdP browser login uses HTTP-only secure session cookies for browser flows; bearer tokens in URLs are retained only for explicitly allowed native deep links.
- Chat routes require bearer auth and enforce conversation membership before reads, writes, reactions, sockets, and read receipts.
- Chat message bodies are length-bounded and returned as data, leaving escaping to React rendering.
- Public event social metadata escapes HTML before injecting into the initial SPA shell.

## Residual Risks And Recommendations

- Configure `PORTAL_ALLOWED_ORIGINS` or `WEB_ALLOWED_ORIGINS` explicitly for any legitimate cross-origin admin tooling. Keep it empty for normal same-origin portal usage.
- Add edge-level rate limits for login, registration, MCP, chat message creation, event registration, org feedback, and file/image upload endpoints.
- Establish rotation runbooks for PIdP `SECRET_KEY`, MCP OAuth private JWKs, provider client secrets, VAPID keys, TURN API tokens, and calendar/email provider refresh tokens.
- Revisit PIdP token lifetime. The current browser session lifetime is long by configuration; consider shorter access-token lifetimes with refresh/session renewal controls.
- Add a CSP for the main web app. The PIdP MCP authorization pages already set a strict CSP, but the SPA shell does not currently advertise one from the edge worker.
- Audit external URLs supplied by tenant data and profiles for phishing/brand trust. They are rendered as links, but operators should review tenant-controlled navigation such as external calendar/map URLs.
- Complete browser smoke tests on production tenant domains for login callback return paths, cookie scoping, CORS behavior, event comments, social preview tags, and mobile surfaces.
- Resolve web dev-tool advisories after npm's install issue is cleared.

