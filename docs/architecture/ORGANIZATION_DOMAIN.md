# Organization domain and multi-user rollout

OrgPortal treats an organization directory record as information about a real
entity. Publishing information must never assign ownership, membership,
representation, or portal administration. REST, MCP, and the portal UI invoke
shared application operations; transport adapters do not own business policy.

This is an incremental modular application. PIdP remains the authority for
identity and authentication. Existing infrastructure names, IDs, foreign keys,
service boundaries, and production release procedures remain stable.

## Domain boundaries

| Module | Owns | Must not imply |
| --- | --- | --- |
| Organization directory | Stable organization IDs, names, websites, locations, public profiles, search and duplicate review | Membership or verified representation |
| Organization access | Membership, portal roles, claims, corrections, invitations and representation review | Legal ownership from a click or an email address |
| Relationships | Typed organization, person and product relationships and their lifecycle | A corporate partnership from a person's employment |
| Evidence | Source references, observation dates, provenance, verification and disputes | A verified claim from an unsourced description |
| Portals | Group sites, branding, domains and feature settings | Control of the organization merely because a portal exists |

The directory is global public information. Private contacts, membership,
private research, governance and account records remain scoped to their tenant
or subject. Every resource reference is resolved and authorized server-side;
OAuth scopes are necessary but never substitute for resource authority.

## Authority vocabulary and compatibility

Use explicit meanings in new workflows:

- **Directory contributor** supplies information; contribution grants no management access.
- **Directory curator** reviews public changes. The first release retains the
  current platform-operator boundary rather than inventing a new permission.
- **Portal administrator** manages a group's configured portal.
- **Verified representative** has a separately reviewed, recorded basis to act
  for the real organization, including review and revocation dates.

Existing `owner` and `administrator` roles retain their current authorization
semantics during migration. They must not be displayed or exported as verified
legal ownership. Public directory responses report `verificationStatus:
not_recorded` until a representation-review system actually exists. Renaming
labels alone cannot verify existing records.

## First implementation

Application modules:

- `organizations/directory.ts`: bounded, cursor-paginated public projections;
  does not expose member identities, private notes, or permission grants.
- `organizationDirectoryOperations.ts`: shared scope, resource and command
  dispatch used by REST and MCP, taking a trusted authenticated context.
- `organization-access/release.ts`: self-service correction of an unconfigured,
  uncontested ownership association, with a reviewed effect and atomic guards.
- Existing organization creation, registry, IAM, evidence import and support
  operations remain application services. Extract further responsibilities as
  their invariants change rather than moving the entire Worker in one release.

Existing organization-insert hooks may enqueue native chat provisioning; this
does not create membership, verified representation or a configured group portal.

Directory registration remains operator-only. Authority derives from live PIdP
session state or validated primary-account introspection; never from an email,
untrusted profile field, tool argument or local identity allowlist. A denied
registration must not be retried as owned creation.

Owned creation requires `acknowledgeOwnership=true` in the reviewed input. Its
preview names the receiving account and owner membership and states that legal
representation is not verified. The old MCP names remain as explicitly deprecated
aliases. Legacy REST owned creation also requires the acknowledgement; cached
clients must refresh to use the reviewed UI. This is an intentional safety
restriction, not an automatic compatibility conversion.

### Ownership correction

The current owner may preview and release only their own association. The
listing, ID, description, evidence references and other memberships remain.
The actor's membership becomes inactive and their active ownership row is
removed. No replacement owner is inferred or notified by email. Existing
membership triggers retain their normal in-app notification/chat behavior.

The existing schema only permits `active` and `transferred` ownership states.
A release must not be falsely labeled a transfer. For the bounded correction
workflow, a minimal audit records the claim ID, start/end time, reason code and
receipt before the active row is removed atomically. Any challenge history or
configured group site blocks this workflow; a managed review is required.
General historical release and succession belong in the reviewed authority
schema migration described below. No schema migration is needed for this phase.

### Operation contract

Every new write has a preview bound to actor, resource, canonical changes and
relevant state; it expires after ten minutes. Apply requires the exact receipt
and explicit confirmation, rechecks authority, and consumes the receipt once.
Directory insertion checks duplicate identity inside its atomic transaction.
Release rechecks ownership, membership, organization state, portal binding and
challenge references inside its transaction.

After a timeout, inspect the actor's operation receipt and live record. Do not
blindly retry. Receipt reads remain available to the actor after releasing
membership, but other users cannot read them. An uncertain status is not proof
that no mutation occurred. Side effects and external provisioning require
separate idempotent steps; do not claim distributed exactly-once execution.

## Transport contract

| Capability | MCP | REST |
| --- | --- | --- |
| Public directory search | `search_organization_directory` | `GET /api/network/directory` |
| Public record read | `get_directory_organization` | `GET /api/network/directory/:id` |
| Unclaimed registration | `preview_directory_registration`, `apply_directory_registration` | `POST /api/network/directory/registration/{preview,apply}` |
| Owned creation | `preview_owned_organization_creation`, `apply_owned_organization_creation` | `POST /api/network/owned-organizations/{preview,apply}` |
| Self correction | `preview_organization_ownership_release`, `apply_organization_ownership_release` | `POST /api/network/orgs/:id/ownership/release/{preview,apply}` |
| Own operation receipt | `get_organization_operation` | `GET /api/network/orgs/:id/operations/:receipt` |

Existing public endpoints remain available for anonymous directory consumers.
The new REST adapter uses existing PIdP authentication. For registration receipts,
the resource key is `organization:registry`; owned-creation receipts use the
synthetic resource key returned by their preview. Organization-restricted MCP
resources cannot register arbitrary organizations or release another group's
ownership. Public directory reads grant no private access.

## Subsequent phases and release gates

| Phase | Work | Gate before production |
| --- | --- | --- |
| Foundation | Directory/owned workflows, self correction, consistent effects and receipts | Contract, authorization, stale-state, rollback and UI checks; clean commit and standard release |
| Curated contributions | Member submissions, moderation queues, scoped curator grants and conflict review | Abuse model, assignment/revocation rules, rate limits and reviewed retention/deletion inventory |
| Representation | Separate representative claims, portal administration and succession; expiry, evidence and revocation | Reviewable schema migration, mapping report, tenant isolation tests and operator acceptance; no automatic verification |
| Structured research | Products, person roles, typed relationships, evidence observations and proposal/acceptance/delivery states | Public/private classification, provenance requirements, correction/deletion propagation and migration dry run |
| Scale and operations | Search indexing, workload budgets, asynchronous side effects and operational dashboards | Synthetic load results, measured query plans, saturation limits and documented rollback |
| Retirement | Remove deprecated aliases and older implicit claim/create flows | Usage evidence, published deprecation window and client migration confirmation |

Each phase should ship as independently reviewable changes with backward-compatible
reads. Prefer additive schemas, versioned contracts and dry-run migration reports.
Do not bulk reclassify existing owners or publish private email outreach during
backfill. Move a source claim only when its provenance and publication basis are
recorded. Preserve stable IDs through deduplication using reviewed aliases rather
than silently replacing records.

## Multi-user operating requirements

- Authenticate every private operation and check live resource authorization on
  every apply. Never let an operator token or tenant selector leak into public
  directory responses, caches or replication payloads.
- Bound page size, request size, traversal depth and per-actor write frequency.
  Use cursor pagination with a stable tie breaker. Do not claim an indexed search
  SLA before production query plans and representative workloads are measured.
- Maintain an action inventory with scopes, resource policy, public effects,
  notifications, reversibility, receipt semantics and error recovery. Generate
  transport schemas from shared contracts as coverage expands.
- Measure errors, latency, authorization failures, conflict rates, uncertain
  operations and moderation backlog without logging tokens, private payloads or
  subject identifiers. Rate limits are an abuse guard, not a substitute for
  capacity planning or per-tenant fairness.
- Validate with synthetic concurrent users across at least two tenants, including
  stale previews, permission revocation, duplicate races, partial failures and
  replica refresh. Set capacity and latency targets after a measured baseline;
  do not advertise untested availability or user-count guarantees.
- Treat database migrations as separate reviewed operations. Rehearse rollback,
  restore, deletion reapplication and public-replica convergence before backfills.
  Deployment rollback does not undo a database change.
- Publish contribution and representation policies, a dispute/escalation route,
  privacy boundaries, accessibility expectations and a support ownership rota
  before opening general public curation.

## Privacy and retention

The foundation adds no personal-data store. Public directory projections reuse
existing organization data. Contribution and release audits reuse the established
minimal audit store and its manual 12-month review/deletion process. Operation
receipts reuse existing expiry and retention controls. Do not add full profile
bodies or email outreach to immutable audit metadata.

Account erasure still inventories actor/subject references, receipts, membership
rows, older journals and backups under the existing privacy runbook. A release
is an access correction, not erasure. Future contact, moderation, evidence and
verification stores require explicit purpose, visibility, retention clock,
delete/correction APIs, downstream propagation and recovery-copy handling before
implementation. Existing policies describe targets; they do not prove that
unverified automation exists.


## Foundation acceptance and deployment

Run API type checks and the full API suite, the frontend unit suite and production
build, plus `npm --prefix web run test:organization-workflows`. The last command
bundles an isolated loopback component fixture, uses synthetic intercepted API
responses, launches Chromium headlessly (set `CHROME_BIN` to use an installed browser), and removes its own temporary files. It
checks directory intent, owned team creation, reviewed effects, ambiguous-response
inspection without replay and self correction. Authenticated integration and
session persistence tests continue to use the local Docker deployment.

Verify REST/MCP parity using the same actor-bound receipt across transports.
Verify resource-scoped discovery, operator revocation, directory privacy, duplicate
previews, stale authority and atomic rollback. Do not replace those tests with
assertions of a fixed tool count.

Release this code through the existing clean-commit review and OrgPortal release
process. No migration is introduced here. Any pending migration already present
on main (including presentation applications) remains a separate review and
rollout responsibility. Do not run it implicitly or bypass a release gate to
correct a single production record. After deployment, refresh MCP discovery,
preview the affected owner's correction, apply its exact receipt, and verify the
public unclaimed state plus the actor's completed receipt. Do not infer a new
owner from a founder name or contact email.
