# Agent handoff: deploy OrgPortal event MCP integration

## Objective and authorization boundary

Apply the already-implemented shared event integration to the correct Cloudflare
OrgPortal environment, configure its authentication and calendar access, and
verify it can be connected to ChatGPT web.

This file is a deployment runbook, not evidence of credentials or permission to
use an arbitrary Cloudflare account. Verify the target account and environment
with the user before production writes. Use configured Cloudflare/GitHub access;
stop at permission failures or missing credentials. Never disclose secret values.

Do not change live MedTech dates, branding, collaborators, or registrations as a
deployment smoke test. Obtain separate approval for real event mutations. A
dedicated, user-approved test event may be used for write verification.

## Source of truth

- Repository: https://github.com/juliancoy/OrgPortal
- Latest implementation commit from this handoff:
  `667d477a512e250897fe22319283f5cee399f1f4`
- Initial integration commit:
  `5a0cafec76c420104563c9b32f3ebe3c6ff3b1be`
- Backend directory: `org-worker/`
- Detailed setup: `docs/deployment/EVENTS_MCP.md`
- Runtime/config: `org-worker/src/index.ts`, `org-worker/wrangler.jsonc`
- Event code: `src/eventPlatforms.ts`, `src/eventMcp.ts`,
  `src/eventOperationStore.ts`, `src/eventConfiguration.ts`
- New migration: `migrations/0017_event_mcp_operations.sql`

Fetch current remote state. Preserve newer work and user changes. Verify that
the implementation commit is included; do not overwrite current main with this
older snapshot. Read any applicable AGENTS.md and deployment instructions.

Local verification at handoff: typecheck, all **57 tests**, and offline bundling
passed. No Cloudflare deployment, remote migration, real OAuth linking, or live
provider write was performed. The configuration checker correctly reported
missing configuration. The offline bundle is not proof of Workers runtime
compatibility; complete the actual Cloudflare packaging/runtime checks.

## What the implementation does

The shared Cloudflare worker exposes `/mcp` with these tools:

| Tool | Behavior |
| --- | --- |
| `list_events` | Paginated managed events for an organization |
| `get_event` | Read an event in its configured calendar |
| `preview_event_changes` | Return proposed changes and a ten-minute preview ID; no external event write |
| `apply_event_changes` | Require write scope, `confirm: true`, and the matching one-use preview ID |
| `get_event_operation` | Inspect the caller's previous operation status |

Luma is the implemented external provider; the interface can support additional
adapters. These tools do not synchronize external events into the native D1
event directory and do not implement attendee registration. Existing native
event APIs, the legacy Python backend, and the PIdP submodule are unchanged.

OAuth JWT verification checks signature, issuer, audience, expiry and explicit
subject mapping. Mapped users must also be active organization owners or
administrators. Luma access must match the configured calendar with `manage`
access. Preview IDs bind the caller, organization, target and normalized proposal
and snapshot; an atomic database claim prevents receipt replay. This is not a
transactional lock against concurrent edits in Luma and is not proof of human
consent. The client must still show the preview and obtain approval.

Operation states are `prepared`, `executing`, `completed`, and `uncertain`.
Never automatically retry an uncertain write or reset its receipt. Inspect the
provider and operation record first. The worker limits authorized tool calls to
60 per mapped user per minute. Audit records omit tokens, credentials, email
addresses and event content; they retain actor/target IDs, hashes and status.

## 1. Inspect Cloudflare before changing anything

These identifiers come from the checked-in configuration and must be verified
against the actual account, not blindly treated as production targets:

| Resource | Checked-in value |
| --- | --- |
| Worker | `org-codecollective` |
| Entry point | `src/index.ts` |
| D1 binding / database | `DB` / `org` |
| D1 database ID | `a71a2306-3d82-44cb-a50c-d7fdffaacdc7` |
| R2 binding / bucket | `SCAN_IMAGES` / `org-scan-images` |
| Queue / dead-letter queue | `org-web-push` / `org-web-push-dead-letter` |
| Compatibility | `nodejs_compat`, date `2026-06-07` |
| Existing cron | Every minute |

Record the active Worker deployment/version and current bindings, routes and
configuration without exposing secrets. Preserve the existing cron, queues,
R2, D1, PIdP and all unrelated features. Do not create duplicate resources or
change the compatibility date merely to get deployment to pass.

Identify which repository/Worker owns the public edge at `codecollective.us`.
The OrgPortal docs describe `/api/org/*` forwarding to the org worker with the
prefix stripped. Confirm that this is the actual deployed route.

## 2. Resolve authentication prerequisites

**Cloudflare access alone is not sufficient to finish OAuth linking.** This
implementation is an OAuth resource server, not an OAuth authorization server.
PIdP's existing social-login clients and personal API tokens do not by themselves
provide the required ChatGPT linking flow.

Use an existing user-approved compatible authorization server. If no issuer is
available, report that blocker and request the user's choice; do not silently
purchase a service, invent an issuer, or weaken authentication.

Verify authorization-code flow with PKCE S256, a supported client registration
method, exact resource audience, event scopes, and RS256 or ES256 access-token
signing. Configure redirect URIs from the actual ChatGPT connection; do not
guess them. An OpenAI API key is not needed by this worker.

| Setting | Required value |
| --- | --- |
| `MCP_PUBLIC_URL` | Exact public HTTPS MCP URL, also the JWT audience |
| `MCP_OAUTH_ISSUER` | Exact approved issuer |
| `MCP_OAUTH_JWKS_URL` | Trusted issuer signing-key URL |
| `MCP_SUBJECT_MAP_JSON` | JSON object mapping issuer subject IDs to existing PIdP user IDs |
| `EVENT_INTEGRATIONS_JSON` | JSON object mapping organization database IDs to provider configuration |
| `EVENT_KEY_<NAME>` | Server-only Luma API key for the mapped calendar |
| `MCP_ALLOWED_ORIGINS` | Optional exact HTTPS browser origins, comma-separated; not `*` |

Required OAuth scopes are `org:events.read` and, for writes, `org:events.write`.
Do not broaden PIdP read-only PAT grants as a shortcut. Verify the mapped user's
existing organization membership; request explicit approval before granting a
new owner/administrator role.

Store credentials through the approved secret manager or interactive Wrangler
secret input. Do not put keys in command arguments, chat messages, Git, logs or
the final report. Changing Worker secrets/configuration can itself create or
activate a deployment: coordinate those operations within the authorized window.

## 3. Configure calendars and approved branding

Example shape only; replace placeholders using verified account data:

```json
{
  "VERIFIED_ORGANIZATION_DATABASE_ID": {
    "provider": "luma",
    "calendarId": "VERIFIED_LUMA_CALENDAR_ID",
    "apiKeyBinding": "EVENT_KEY_MEDTECH",
    "branding": {
      "tintColor": "#0f6f8f",
      "sourceUrl": "https://medtech.social",
      "revision": "REVIEWED_BMOREMEDTECH_COMMIT_SHA"
    }
  }
}
```

Review the current MedTech branding page and
https://github.com/juliancoy/BmoreMedTech before approving the branding revision.
The tint above came from the previously inspected repository; recheck it.
An optional `branding.coverUrl` must reference the approved asset already
uploaded to `https://images.lumacdn.com/...`. The MCP server intentionally does
not fetch arbitrary image URLs or read local image files. Ask for any necessary
upload authorization and calendar/API entitlement. Do not assume possession of
a read-only Luma connector gives access to the public API write key.

## 4. Test and validate configuration before deployment

From the checked-out `org-worker/` directory:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run check:bundle
npm run events:check-config
```

The last command reads the process environment and logs only issue codes and
counts. Supply configuration securely using the execution environment. It does
not retrieve Worker secrets. Optionally validate an operator-downloaded OAuth
discovery JSON file:

```sh
npm run events:check-config -- authorization-metadata.json
```

Perform Wrangler's actual dry-run packaging check after inspecting the installed
version's commands and the correct environment. Fix and review runtime/package
failures rather than treating the offline bundle as sufficient evidence.

## 5. Apply the additive migration safely

Inspect the remote migration ledger and pending SQL first. Confirm backup/restore
availability and record a restore point using the account's supported D1 process.

Migration `0017_event_mcp_operations.sql` adds:

- `event_mcp_operations` plus an actor/time index;
- `event_mcp_rate_limits`.

It does not delete or rewrite existing event records. Review the exact SQL at
the revision being deployed. The migration must exist before the new tools run.

Typical Wrangler commands, **only after target and migration review**:

```sh
npx wrangler d1 migrations list org --remote
npx wrangler d1 migrations apply org --remote
```

Add the verified environment selector if this deployment uses named environments.
`migrations apply` may run every pending migration, not just 0017. Stop if there
are unrelated unreviewed migrations; do not apply them or alter the ledger to
bypass review. Confirm both new tables and the migration record afterward.

## 6. Deploy the shared worker and discovery route

After the configuration, backup, migration and packaging checks pass, deploy
`org-worker` through the authorized Cloudflare mechanism. Do not deploy the
MedTech static site as a substitute for the shared backend.

Choose one canonical resource URL and use it consistently:

- Direct worker HTTPS URL ending in `/mcp`; or
- `https://codecollective.us/api/org/mcp` through the verified public edge.

For the latter, route BOTH public paths to the org worker:

| Public path | Worker destination |
| --- | --- |
| `/api/org/mcp` | `/mcp` |
| `/.well-known/oauth-protected-resource/api/org/mcp` | Same path or the worker's corresponding protected-resource metadata handler |

The existing `/api/org/*` proxy does **not** cover root-level discovery. Preserve
Authorization, Accept, Content-Type, MCP protocol headers, response status and
WWW-Authenticate. Bypass caching for MCP traffic and preserve no-store responses.
Do not log Authorization or request bodies. Do not apply broad permissive CORS.
Keep discovery public; protected MCP calls must require authentication.

## 7. Acceptance checks

1. `/health` works and the existing portal, native event APIs and unrelated
   bindings still function. Check logs without disclosing sensitive data.
2. Protected-resource discovery returns the configured canonical resource,
   issuer and scopes, without leaking credentials or subject mappings.
3. Unauthenticated `/mcp` receives 401 with a discovery challenge. Bad issuer,
   audience, expired tokens and unmapped subjects are rejected.
4. A valid token initializes MCP and discovers all five tools. Verify top-level
   `securitySchemes`, write annotations and the scope reauthorization challenge.
5. A permitted administrator can list/read only the configured managed calendar.
   Other organizations/calendars and read-only-token writes are denied.
6. Preview succeeds without changing Luma and returns a preview ID and expiry.
   Changed, expired, reused and wrong-user receipts cannot execute writes.
7. With explicit approval on a dedicated test event only, apply a harmless
   change, inspect the result and operation status, and verify replay rejection.
   Confirm the rate limit and audit records in a controlled test environment.
8. Add the authenticated MCP connection in ChatGPT web and complete real OAuth
   linking. Refresh its tools and verify read, preview and approved test writes.

If step 7 or 8 cannot be performed, report them as unverified, not passed.

## Rollback and completion report

If deployment fails, restore the recorded prior Worker version and only the
edge/configuration changes introduced by this rollout. Do not drop the additive
tables or erase operation receipts/audit records. Inspect `executing` and
`uncertain` operations before any retry; code rollback cannot undo a Luma write.

Report the deployed Git SHA, Cloudflare account/environment, Worker version,
canonical MCP URL, discovery URL, migration result, checks passed/blocked and
remaining configuration decisions. Never include secret values.

The requested MedTech formational event changes remain a separate task. Earlier
planning referenced event `evt-HcIBdMOolELnKgY`, September 29, 2026, and a proposed
6–8:30 p.m. America/New_York schedule. Verify the live event and time before any
execution. Resolve Palava Hut's actual Luma account with the user; a public
contact email is not sufficient proof. Do not execute those changes merely
because this deployment succeeded.

## References to recheck when executing

- https://github.com/juliancoy/OrgPortal/blob/main/docs/deployment/EVENTS_MCP.md
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://developers.cloudflare.com/workers/wrangler/commands/
- https://developers.cloudflare.com/d1/reference/migrations/
