# Browser-authorized local image uploads

## Persistent connections: 2026-09-17

The uploader now retains its own account grant in OS credential storage. Verified
live sign-in followed by automatic token rotation in separate processes, MCP
initialization, and all four NOLA_MENU uploads to MedTech in the Hut. Downloaded
image SHA-256 hashes match the local originals. No API key was used.

OrgPortal Worker `e947c107-f730-42f7-98a0-004fc90a2be6` fixes live introspection:
Workerd rejects `redirect: "error"` before making the request. The check now uses
`manual` and rejects all non-2xx responses, including redirects. Secrets and
tokens are never logged. PIdP's existing five-minute access tokens and 30-day
grants are unchanged, so no Python/serverless behavior divergence was introduced.

Shared frontend Worker `bd626cc6-6c12-4be4-815e-ca0cb93d3fa7` resolves stored
gallery image URLs through the existing `/api/org` proxy, preserving external
image URLs, and wraps long filenames with readable caption colors. The desktop
and mobile gallery routing and caption regression tests pass.

Codex manages its own credentials separately. The locally installed Codex Snap
does not expose a password-manager interface. Uploader persistence does not
resolve that packaging restriction or grant access to Codex's keyring entries.

## Production release: 2026-09-17

Released through CodeCollective's backend deployment path:

- PIdP Worker version: `a7647994-2ade-4660-af01-ba95da663d1f`.
- OrgPortal Worker version: `268a394e-969e-4e33-b926-e5e7d50baa87`.
- Applied OrgPortal migration `0018_event_media.sql`; PIdP migrations were current.
- Verified MedTech MCP discovery returns 200 and the canonical resource is
  `https://medtech.social/api/org/mcp`.
- Verified MCP and upload requests without credentials return 401 with OAuth
  discovery challenges, PIdP advertises public-client authentication, and the
  public event still loads.

Existing OAuth registrations and settings were preserved. This release did not
create a new client registration or complete browser consent on a user's behalf.
Register the intended client's exact callback before connecting a new client.
The Python PIdP implementation was not deployed; production here uses the Worker.

## Workflow

The shared uploader lives in OrgPortal, not in tenant repositories. It opens the
system browser for PIdP account login and consent using a registered public OAuth
client with PKCE S256, a random state and a loopback callback. It verifies the
callback issuer and state. By default, the client registration and rotating refresh
token are saved in the OS keyring under `OrgPortal upload OAuth`, isolated by
issuer and resource. Access tokens stay in memory. Connections survive normal
completion, upload errors and restarts, within PIdP's existing 30-day grant limit.
There is no API key or copied browser session token, and no plaintext fallback.
On Linux, persistent Secret Service storage is required; kernel session keyrings
are not used as a fallback. This is separate from Codex's own credential store.

Concurrent uploader processes for the same connection are excluded using a
private, non-secret lock under `~/.orgportal-connections`. Refresh intent is saved
before sending a one-use token; an interrupted or ambiguous refresh requires
disconnect/reconnect rather than replay. A failed disconnect retains credentials
so revocation can be retried. Revocation is also available through PIdP's
`/oauth/mcp/connections` page.

## Release prerequisites

- Enable PIdP dynamic public-client registration, or supply a pre-registered
  `--client-id`. The uploader registers itself once and remembers the client ID.
- Deploy PIdP public-client support using its release path.
- Configure the canonical MCP resource, explicit account subject mappings and
  live introspection in OrgPortal. Existing organization membership still applies.
- Release the OrgPortal Worker through CodeCollective, including migrations 0017
  and 0018 and the `SCAN_IMAGES` bucket binding. Route `/api/org/mcp/uploads/*`
  through the existing tenant proxy to the shared Worker.

Local source is not proof that these prerequisites are active in production.

## Usage

From `OrgPortal/org-worker`, with Node 22+:

```sh
node scripts/event-upload.mjs \
  --resource https://medtech.social/api/org/mcp \
  --organization org-baltimore-medtech \
  --event medtech-in-the-hut \
  --directory "$HOME/Downloads/NOLA_MENU"
```

Install local tooling dependencies with `npm ci`. Connect without uploading, or
explicitly revoke the saved connection:

```sh
node scripts/event-upload.mjs --resource https://medtech.social/api/org/mcp --connect
node scripts/event-upload.mjs --resource https://medtech.social/api/org/mcp --disconnect
```

`--ephemeral` opts into the previous memory-only, revoke-on-exit behavior for an
upload. It does not read or modify the persistent connection. Do not copy Codex
credentials into this uploader; each client owns its own account grant. A locked
or inaccessible keyring is an actionable error, not a reason to store tokens in
the repository or weaken system sandbox restrictions.

The browser must run on the same machine as the uploader's loopback listener.
`--no-browser` prints the authorization URL without launching a browser.
The script displays each preview and asks before attaching the image. An agent
may use `--yes` after the user has authorized that upload; it still obtains and
applies a server preview. Files are processed in filename order, with filenames
as labels. Edit labels through the existing event gallery UI as needed.

Uploads append images, never replace the gallery. Each file is a separate
operation; if a later file fails, earlier successful uploads remain attached.
The client deliberately stops on ambiguous failures instead of retrying and
creating duplicate images. Inspect the gallery and `get_event_operation` before
retrying. Use a directory containing only the remaining files when resuming.

## API contract

`POST /mcp/uploads/event-media` uses the same OAuth audience as `/mcp`, requires
`org:events.read` and `org:events.write`, checks active organization management
permissions, and fails closed without live account introspection. The multipart
fields are `organizationId`, `eventId` (ID or slug), `image`, optional `label` and
`alt`. JPEG, PNG, GIF and WebP are limited to 8 MB, with a maximum of 12 gallery
items. The complete multipart body is bounded before parsing.

First send without `confirm` to obtain a preview and one-use `previewId`. Then
send the identical image/metadata with `confirm=true` and that `previewId`.
The receipt binds the user, organization, event, image hash, metadata and gallery
snapshot. Expired, replayed, modified or cross-account receipts are rejected.
Permissions and live token status are rechecked on apply. Conditional database
updates prevent overwriting concurrent gallery edits.

The image bytes use the existing R2 event-media prefix; gallery metadata uses
`events.media_json`, and operation receipts use the existing event audit tables.
Known unattached objects are deleted after conditional-write conflicts. An
ambiguous storage/database failure leaves an inspectable operation and may need
operator reconciliation; it is never reported as a confirmed success.

Tests: `node --import tsx --test test/event-media-upload.test.ts`, the existing
event safety/introspection suites, and `npx tsc --noEmit`.
