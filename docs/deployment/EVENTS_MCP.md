# Shared event integration and ChatGPT web

## Existing versus new

OrgPortal already has native D1 event listing/creation and PIdP personal API tokens.
The developer page advertised `/api/org/mcp`, but neither the checked-out Python
backend nor the Cloudflare worker implemented it. PIdP's `org_mcp` PAT grants are
read-only; its social-login OAuth clients are not an MCP authorization server.

This implementation adds `/mcp` to **org-worker**, the shared Cloudflare backend.
It does not change the legacy Python backend or the PIdP submodule. The existing
`/api/org/*` edge proxy can expose it at `/api/org/mcp`. Native D1 event APIs are
unchanged; these tools manage the external provider's authoritative events and
do not synchronize a duplicate D1 record.

## Tools and provider contract

| Tool | Effect |
| --- | --- |
| `list_events` | List an organization's managed external events, with cursor pagination |
| `get_event` | Read one event from that organization's calendar |
| `get_event_operation` | Inspect the requesting user's prior operation status |
| `preview_event_changes` | Always preview, even if `confirm: true` is supplied |
| `apply_event_changes` | Preview by default; write only with `confirm: true`, a matching `previewId`, and write scope |

Changes support name, start/end timestamps, timezone, description, uploaded cover,
tint, visibility, registration status, notification suppression, and a collaborator
with an exact email, access level, and public visibility. The client should show
the preview and obtain user approval before applying. The `confirm` argument is
an explicit execution switch, **not cryptographic proof of human approval**.
Previews now return a ten-minute, one-use `previewId`. The server binds that ID to
the user, organization, event, proposed changes, approved branding and normalized
event snapshot. Applying a changed/expired/used preview fails with no write.
An atomic database claim prevents concurrent reuse across Worker instances.
The client still must obtain human approval; possession of a preview is not consent.
This detects changes to the returned event snapshot, not every hidden provider
field, and is not a transactional lock against concurrent edits in Luma itself.
Write tools have destructive/non-idempotent annotations because they can notify
guests and grant event-management access. Updates and collaborator invitations are
not atomic; a timeout can have an unknown outcome. Inspect the provider before retrying.

`src/eventPlatforms.ts` defines `EventProvider`, the generic schemas and registry.
Luma is the first adapter, not a claim that other vendors already work. Register
another provider factory implementing list/get/validateUpdate/update/addCollaborator;
the adapter must enforce calendar ownership on all reads and writes. Provider
URLs, credentials, and account mappings cannot be supplied by a tool caller.

## Configure the shared worker

No secrets, account grants, or live event changes are included in this commit.
Migration `0017_event_mcp_operations.sql` must be applied when deployment is
eventually authorized. It has only been tested against an in-memory database.
It adds operation audit records and a rate-limit counter (60 authorized tool
calls per mapped user per minute). Audit records omit email addresses, event
content, credentials and tokens. They retain the actor, target, fingerprint,
timestamps, execution state and completed-step names. No automatic retention
deletion is enabled; choose a retention period operationally. Rate-limit storage
uses one row per mapped user, rather than growing a row every minute.
Storage failures fail closed before provider writes. Failure after a claim stays
`executing` or `uncertain` and cannot be replayed; inspect `get_event_operation`
and the live event before creating a new preview.
MCP returns 503 until configured. Use your secret manager or interactive
`wrangler secret put NAME` from `org-worker`; never commit API keys or paste them
into ChatGPT messages.

Required configuration:

| Setting | Meaning |
| --- | --- |
| `MCP_PUBLIC_URL` | Exact public HTTPS resource/audience, e.g. `https://codecollective.us/api/org/mcp` |
| `MCP_OAUTH_ISSUER` | Your OAuth authorization server's exact issuer |
| `MCP_OAUTH_JWKS_URL` | Its trusted HTTPS signing-key endpoint |
| `MCP_SUBJECT_MAP_JSON` | Explicit map of issuer subject IDs to existing PIdP user IDs |
| `EVENT_INTEGRATIONS_JSON` | Organization **database ID** to provider configuration |
| `EVENT_KEY_<NAME>` | Server-only provider API key, one binding per calendar |
| `MCP_ALLOWED_ORIGINS` | Optional comma-separated browser origins; omit for server-to-server clients |

Example integration configuration (replace every placeholder):

```json
{
  "MEDTECH_ORGANIZATION_DATABASE_ID": {
    "provider": "luma",
    "calendarId": "LUMA_CALENDAR_ID",
    "apiKeyBinding": "EVENT_KEY_MEDTECH",
    "branding": {
      "tintColor": "#0f6f8f",
      "sourceUrl": "https://medtech.social",
      "revision": "REVIEWED_BMOREMEDTECH_COMMIT_SHA"
    }
  }
}
```

Review the current MedTech branding page against `juliancoy/BmoreMedTech` before
approving the revision and assets. Add `branding.coverUrl` only after uploading
the approved cover to Luma; Luma requires an `https://images.lumacdn.com/...` URL.
This server deliberately does not fetch arbitrary model-supplied image URLs or
read local file paths. `applyBranding: true` uses the administrator-approved
cover/tint, not text scraped from an untrusted event. Other organizations have
their own branding and calendar bindings; nothing is hard-coded to MedTech.

The configured OAuth server must support the MCP authorization flow (authorization
code with PKCE and suitable client registration), issue signed RS256/ES256 access
tokens for the exact resource audience, and grant `org:events.read` plus
`org:events.write` only when approved. This worker is an OAuth **resource server**,
not an authorization server. Configure an existing compatible issuer or extend
PIdP separately; do not point it at PIdP's social-login endpoints and assume that
linking will work. OpenAI API keys, Luma keys, and PIdP PATs are not interchangeable
with these access tokens. No OpenAI API key is needed by this server.

Mapped PIdP users must additionally be active owners or administrators in
`organization_memberships` for the requested organization. Token claims never
grant system-administrator access. Luma responses must identify the configured
calendar and `access: manage`, including immediately before each mutation.

## Proxy and ChatGPT setup

The worker serves OAuth protected-resource metadata at
`/.well-known/oauth-protected-resource` and its path-qualified variants.
If the public resource is `/api/org/mcp`, the **edge** must route
`/.well-known/oauth-protected-resource/api/org/mcp` to this worker too. The usual
`/api/org/*` proxy alone does not cover that root-level discovery URL. Configure
that route in the repository which owns the public edge, or connect directly to
the worker's HTTPS `/mcp` URL and use that URL as the configured audience.

Deploy only after configuring the issuer, membership mappings, secrets, and edge.
Use MCP Inspector to initialize/list/call with valid and invalid tokens. Then add
the HTTPS endpoint as an OAuth-authenticated developer-mode connection in ChatGPT
and verify read access, denied writes, and user-confirmed changes against a test
calendar. Refresh the connection after changing tool definitions.

Official references:
- [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth)
- [Connect and test in ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Luma public API schema](https://public-api.luma.com/openapi.json)

## MedTech formational event example (preview only)

```json
{
  "organizationId": "MEDTECH_ORGANIZATION_DATABASE_ID",
  "eventId": "evt-HcIBdMOolELnKgY",
  "update": {
    "startAt": "2026-09-29T22:00:00Z",
    "endAt": "2026-09-30T00:30:00Z",
    "timezone": "America/New_York"
  },
  "applyBranding": true,
  "confirm": false
}
```

This preserves the previously proposed 6–8:30 p.m. Eastern schedule; verify it
against the live event before execution. Resolve Palava Hut's actual Luma account
email with the user before adding `collaborator`. A public contact email alone
does not establish the correct account. This example has not been executed.

## Verification

From `org-worker`:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run check:bundle
npm run events:check-config
```

The configuration checker reads the process environment and performs **no network
requests or writes**. It reports only issue codes and counts, not configuration
values. Optionally supply a previously downloaded issuer discovery document:

```sh
npm run events:check-config -- authorization-metadata.json
```

It checks configured identities, providers, key presence, branding constraints,
HTTPS origins and (when supplied) issuer/JWKS agreement, authorization-code flow,
PKCE S256, and event scopes. It does not verify credential validity, organization
membership, issuer reachability, client registration, or successful OAuth linking.
Missing settings are an expected failing result until operators configure them.

`check:bundle` is an offline import/bundle check with Node compatibility (already
enabled in Wrangler), not a replacement for a future Wrangler/runtime test.
CI runs typecheck, all tests and that bundle check. It has no deployment steps,
credentials, remote migration commands, or publication permissions.

Tests mock the provider and signing keys; no tests mutate live events. Production
readiness still requires an end-to-end OAuth linking test and a real test-calendar
write. Configure edge-level unauthenticated request limits and audit retention
appropriate to your host before making the connection broadly available.
