# OrgPortal

OrgPortal is the shared organization and community application used by
CodeCollective and tenant sites such as MedTech. `web/` owns the portal UI;
the organization, governance, and chat services own their domain workflows.
PIdP is a separate identity provider maintained in the sibling `../pidp`
checkout, not a vendored service in this repository.

## Account and Service Boundaries

These are ownership rules, not a claim that all migration work is complete.

| Capability | Source of truth and implementation owner |
| --- | --- |
| Credentials, social sign-in, identity verification, recovery, authentication sessions, and account security | PIdP |
| Stable identity subjects, core identity profile/avatar, and linked login providers | PIdP |
| OAuth client registration, PKCE, connected-app consent, tokens, refresh, and grant revocation | PIdP |
| Organizations, membership, invitations, roles, and domain authorization | OrgPortal |
| Member directories, organization-specific profiles/preferences, governance, chat, and event administration | OrgPortal |
| Personal calendar and event workflows, including event galleries | OrgPortal, using existing PIdP provider-credential/calendar interfaces where applicable |
| Tenant branding, navigation, sign-in entry points, and post-login application routing | OrgPortal |
| Medical datasets, taxonomy/strategy analysis, and public medical event presentation | MedTech |

Reusable account and security screens belong in PIdP. Portal account pages may
compose domain settings and link to PIdP-managed identity settings, but must not
implement another credential store, provider callback, recovery flow, or token
issuer. A branded portal sign-in entry point is appropriate; duplicating the
authentication implementation is not. Identity-profile edits use PIdP interfaces;
membership-profile edits stay in OrgPortal.

For MCP, the intended flow is: client -> PIdP authorization -> existing account
sign-in -> explicit PIdP consent -> client callback -> OrgPortal tools. Preserve
the requesting portal and its account namespace through sign-in. Never silently
substitute PIdP owner login for a portal website-user account. Portal sessions
and issuer sessions are not automatically interchangeable across domains; any
handoff must be validated and preserve OAuth state, exact redirects, and PKCE.

PIdP authenticates an identity and limits delegated scopes. OrgPortal independently
checks the mapped identity, current membership, domain permissions, and required
preview/apply receipts on each operation. OAuth consent does not create membership
or administrator access. Never infer privileged identity mappings from email.
Event gallery objects and metadata remain OrgPortal-owned, not identity assets.

The `/users/mcp-connect` route reuses the existing portal login and explicitly
confirms the account. PIdP exchanges its one-use, browser-bound handoff for a
resource-bound MCP browser session and then hosts consent. Configure the resource
mapping in PIdP; do not accept a client-supplied issuer or portal destination.
Move reusable account UI upstream incrementally while preserving existing
subjects and sessions, with integration tests before switching routes.

Shared portal releases go through the CodeCollective checkout. PIdP is released
separately, with equivalent account/OAuth behavior in Python and serverless.
MedTech deployment must not deploy either shared service.

See [architecture](ARCHITECTURE.md), [account authorization](../pidp/docs/account-oauth.md),
and [event uploads](docs/deployment/EVENT_UPLOADS.md).

## Historical Project Context

The ballot-sign material below records the original civic project context. Its
placeholder status statements do not describe the current OrgPortal platform.


## Intent Statement

This project exists to **build a production-grade, open-source platform** that improves how ballot initiatives are discovered, signed, and securely recorded in Washington, DC.

This repository is currently a placeholder only because the initial project team has not yet met. The intent is not exploratory tinkering or a speculative prototype. The intent is to do the serious legal, technical, and civic work required to design, validate, and implement a system that can operate within DC election law and earn public trust.

---

## Overview

This repository hosts an open-source civic technology project focused on modernizing the ballot initiative signing process in Washington, DC.

Today, ballot initiative campaigns rely heavily on door-to-door canvassing to collect signatures. While legally valid, this approach is inefficient, costly in volunteer time, and often uncomfortable for residents. Awareness of active ballot initiatives is also limited.

This project aims to address those challenges by creating a secure, accessible, and legally compliant digital platform that:

- Helps residents **discover active ballot initiatives**
- Enables eligible residents to **find and sign initiatives through a trusted digital workflow**
- **Securely records and maintains signature data** in alignment with DC election requirements

---

## Project Status

- The initial project team has **not yet convened**
- No architectural or technical decisions have been made
- Early work will begin at Civic Tech DC meetings in January
- Initial efforts will focus on:
  - Legal feasibility and requirements
  - System architecture and security considerations
  - Review of existing open-source ballot initiative platforms

This README will evolve as the project takes shape.

## Project docs

- Architecture contract: `ARCHITECTURE.md`
- Route contract: `ROUTES.md`
- Architecture recommendations: `docs/architecture/ARCHITECTURE_RECOMMENDATIONS.md`
- Frontend mockup recommendations: `docs/mockups/FRONTEND_MOCKUP_RECOMMENDATIONS.md`
- AWS deployment (static demo): `docs/deployment/AWS_DEPLOYMENT.md`
- Cloudflare + PIdP deployment: `docs/deployment/CLOUDFLARE_PIDP_DEPLOYMENT.md`
- Shared event providers and ChatGPT MCP setup: `docs/deployment/EVENTS_MCP.md`

---

## How to Get Involved

This is a multidisciplinary civic effort. We welcome contributors with backgrounds in:

- Software engineering (frontend, backend, security, infrastructure)
- UX and accessibility design
- Election law and public policy
- Civic engagement and campaign operations

**To get involved:**
- Join the `#ballot-sign` Slack channel in the Civic Tech DC Slack
- Introduce yourself and share what you’d like to contribute or learn

---

## Guiding Principles

- **Legitimacy first** — legal compliance is a core requirement
- **Security and auditability by design**
- **Accessibility for residents**
- **Transparency in process and governance**
- **Open source, open collaboration**

Ballot initiative signatures are not fully private by law. Any system built by this project will reflect that reality clearly and responsibly.

---

## Relationship to Civic Tech DC

This project is being developed within the Civic Tech DC community. It is not a closed startup and not a casual experiment. It is an open, serious attempt to build civic infrastructure that could meaningfully improve democratic participation in DC.

---

## Call to Action

If you’re interested in helping build this platform:

👉 Join the `#ballot-sign` Slack channel in Civic Tech DC and introduce yourself.


## Local browser validation

`run.py` also enables automatic local transactional-journal sync every minute
using your existing Cloudflare operator login. For setup without restarting,
run `python3 scripts/setup-journal-sync.py`. See
[journal operations](docs/deployment/CHANGE_JOURNAL.md) for requirements and status.

Local startup registers the configured portal application in the local PIdP
database automatically. Repeat starts preserve the existing registration and
accounts. This requires the sibling PIdP checkout's
`scripts/register_local_portal.py`; its registration owner is inactive and
grants no sign-in or organization privileges.

`run.py` starts the portal, org worker, chat worker, and sibling PIdP on the
local Docker network. Chat and org share local D1 storage for the contact
directory. The HTTPS gateway serves the app and API/WebSocket routes at
`https://localhost:8443`; local chat does not use the production chat worker.

With the local deployment running, execute desktop and mobile browser checks:

```bash
npm --prefix web run test:e2e:local
```

`ORGPORTAL_LOCAL_TENANT_HOST` selects a tenant hostname from the local org
database (for example `lifetech.fyi`) while keeping browser and authentication
traffic on localhost. The default is the Code Collective tenant.

`PLAYWRIGHT_BASE_URL` can select another localhost gateway port.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a Chromium executable (the default
is `/usr/bin/google-chrome`). The local configuration accepts the development
TLS certificate and does not launch another Vite server. Most browser scenarios
use API fixtures; real login and session checks use the local PIdP test account.

For the real onboarding click-through (registration, local email verification,
required steps, month availability, reload persistence, and mobile layout):

```bash
ORGPORTAL_LOCAL_TENANT_HOST=lifetech.fyi python run.py bmoremedtech- bmoremedtech
docker exec bmoremedtech-org node_modules/.bin/wrangler d1 execute org --local --file test/fixtures/local-onboarding.sql
python web/scripts/test-local-onboarding.py
```

The SQL file seeds a local onboarding-enabled tenant without replacing existing
tenants. All onboarding reads and writes use the real local APIs.
The test requires Playwright for Python and Chrome. It uses PIdP's API to create
and authenticate a fresh test identity, then clicks through the onboarding UI.
Keep `PIDP_EMAIL_VERIFICATION_DELIVERY=log`; the test reads only the fresh
account's verification link from the local container log without printing it.
For a different stack prefix, set `ONBOARDING_PIDP_CONTAINER`; for a different
gateway port, set `PLAYWRIGHT_BASE_URL` to the same local origin used by the
launcher. The test checks trusted origins and the tenant's onboarding setting
before creating the account. Screenshots are saved in `.local/session-test/`.

## Organization support and the master transaction record

Every organization page includes descendants (direct recipients and organizations
reached through recipients), supporters, and public evidence records. Descendants
are derived from `organization_support_records`; relationships confer no
ownership, membership, or permissions. Cycles are supported without repeating the
starting organization. Program terms, portfolio/co-investment aggregates, and
institutional affiliation remain contextual records rather than proof of support
to a named recipient. Unknown endpoints remain labels, not invented organizations.

`master_transaction_records` unifies the internal payment ledger and documented
external monetary/nonmonetary support. Economic operations reads
`GET /api/transactions/master?limit=50&offset=0`; the legacy payment APIs and money
supply calculations continue to read the settlement ledger. Recording support
never sends money or changes account balances. Monetary amounts keep their
currency; nonmonetary contributions keep quantity and unit. Unknown amounts stay
null, and overlapping source reports are not totaled. The master view orders by
recording time and retains the original date or period separately.

`GET /api/network/orgs/public/:slug/support` exposes descendants, direct
supporters, and up to 500 evidence records. Management writes use
`POST /api/network/orgs/:organizationId/support/record` or `/support/void`.
Request a preview (`confirm: false`), inspect it, then resubmit the same changes
with `confirm: true` and its `previewId`. Both API and MCP recheck live organization
management permissions and require a matching, actor-bound, expiring, one-use
receipt. Voiding keeps the record, correction reason, and audit history.
MCP exposes list, preview/apply support, and preview/apply void tools under the
existing `org:portal.read` and `org:portal.write` scopes.

Migration `0057` adds the records and master view. Migration `0058` imports the
already-public October 1, 2026 LifeTech Associates snapshot from
`../bmoremedtech/assets/data/ecosystem.json`: 69 distinct organizations and 51
records, preserving matched financing/network evidence once, source rows, period,
amount semantics, and unresolved scopes. Funds and programs retain separate
identities. No raw spreadsheet contacts, account mappings, or memberships are
imported. The import generator is
`node org-worker/scripts/build-ecosystem-support.mjs [snapshot.json] [output.sql]`;
use a new migration file for later snapshots instead of rewriting an applied
migration. Shared services continue to release through CodeCollective.

### Public evidence registration and event enrichment

Authenticated operators can register an **unclaimed** public directory record via
`POST /api/network/orgs/registry` with `name`, `description`, `sourceUrl`, optional
`website`/`city`, and `tags`. This differs from creating an organization owned by
the signed-in account: registration creates no ownership or membership.

`POST /api/network/events/:eventId/enrichment` accepts `sourceUrl` and a strict
`changes` object containing `description`, `ends_at`, `location`, `image_url`, or
`host_org_id`. It checks existing and proposed host management permission;
unclaimed events require an operator. Enrichment updates public metadata only.
Both endpoints require a reviewed `confirm: false` preview followed by the same
request with `confirm: true` and its actor-bound, expiring, one-use `previewId`.
Changes are audited; intervening event edits invalidate the preview. Unknown
organization locations and websites remain null.

### Onboarding identity and persistence

PIdP owns identity linking and the shared personal profile. Its authenticated
`GET /auth/me` response supplies `id = canonical_user_id`, `account_id`, and
`account_subject`; incomplete identity responses are rejected. Browser and MCP
organization authorization use the verified canonical person and live OrgPortal
memberships. OAuth subjects and website credential namespaces remain unchanged.

Onboarding completion and acknowledgements persist in `onboarding_enrollments`
by tenant and canonical person. Existing source-account progress is combined on
the next onboarding or task-queue read. Availability keeps the newest saved
observation for each slot. Duplicate memberships and tasks can be consolidated
through `/api/identity-membership/:organizationId/preview` and `/apply`, after
PIdP verifies the linked account and OrgPortal verifies management authority.
The one-use preview preserves completed work and records an audit event.

Apply PIdP migration 0010 and release PIdP first, then deploy the OrgPortal Worker
through CodeCollective. Account linking requires authentication to both accounts;
email matching never establishes identity or authority.

Organization managers can configure onboarding through
`POST /api/onboarding/settings/preview` and `/apply` with `enabled`, followed by
the matching `previewId` and `confirm: true`. These operations preserve all other
tenant settings and write an audit event. Saving a slug portal retains attached
custom domains and existing onboarding preferences.

## Organization ecosystem network

The shared `/ecosystem/network` page includes sourced organization relationships, funding evidence, and event-history search. It is public and uses the common portal navigation. CodeCollective serves it at `/p/ecosystem/network`; tenant sites serve it at `/ecosystem/network`. LifeTech keeps its static directory and consumes these shared snapshots.

From `web`, run `npm run test:ecosystem` for evidence and layout checks, `npm run sync:ecosystem` to refresh public workbook/API evidence, and `npm run build:ecosystem-history` to rebuild the event archive from sibling CodeCollective (or `CODECOLLECTIVE_DIR`). See [the data guide](docs/ecosystem-network-data.md). These commands produce public read snapshots; organization writes continue through the authorized API preview/apply flow.
