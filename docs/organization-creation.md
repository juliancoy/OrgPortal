# Organization creation and chat

The organization API (`POST /api/network/orgs`) and MCP organization creation
share one routine: persist the organization, claim it through organization IAM,
then provision its native organization chat room.

Migration `0062_organization_chat.sql` creates a durable provisioning job in the
same transaction as every organization insert. Registry imports, calendar
ingestion, scans and future creation paths therefore receive rooms too. Existing
organizations are backfilled. Name or slug changes enqueue a room metadata update.

OrgPortal's minute scheduler processes pending jobs through the chat Worker's
`OrganizationRooms` RPC service binding. Failed jobs remain pending and are
retried; oldest unattempted jobs take priority, then organizations with members.
Chat owns room storage. Provisioning uses the stable ID `org-room-${organizationId}`,
so concurrent requests and retries cannot create duplicate rooms. Existing active
organization memberships supply the room's membership and roles. Membership
changes enqueue synchronization too; chat blocking is preserved. Provisioning
never grants organization membership or ownership.

The organization profile shows one organization Chat entry. Opening it calls
`POST /api/network/chat/org-room` with `organization_slug`, which verifies current
organization membership and joins the shared room. Reads, sends and socket
connections also require active organization membership; a blocked chat member
cannot rejoin through this endpoint.

Release the chat Worker first, apply migration 0062, then release the org Worker
with its `CHAT_ORGANIZATION_ROOMS` service binding, followed by the shared frontend.
The Worker entrypoint is `chat-worker/src/worker.ts`. Local shared-stack configs
must use this entrypoint when testing RPC provisioning.

## Account identity and administrator access

PIdP owner accounts and application member accounts are separate subjects. A
shared email does not merge their profiles or transfer permissions. Resolve the
account ID in the correct PIdP application namespace, then explicitly grant that
account an OrgPortal membership. The acting owner or administrator must have live
management authority; the grant is audited against both account IDs.

For scripted reconciliation, POST the intended membership to
`/api/network/orgs/{organizationId}/members/preview`, inspect the before/changes,
then POST identical fields plus `previewId` to the `/members/apply` endpoint.
Receipts are actor-bound, expire, reject roster changes, and are usable once.
`scripts/organization-member.mjs` provides this flow with a session credential
from an env file. A PIdP service PAT cannot substitute for a member session.

System administration is distinct from organization administration. PIdP grants
system administration only through configured owner account IDs. OrgPortal
trusts PIdP's top-level system-admin result; email and editable profile roles
never grant system authority. Website accounts cannot inherit an owner's system
role even when email or UUID values match.

## Claiming an existing organization

An unclaimed organization profile offers **Claim This Organization** to signed-in
users and **Sign in to claim this organization** to visitors. The first successful
claim atomically creates the ownership record, an active owner membership, and an
audit event. Owners are organizers: they can manage the organization profile,
members, and events immediately. Profile controls and the navbar refresh without
requiring a reload. Access is tied to the authenticated account ID.

Repeated claims by the owner are idempotent. A competing claim cannot replace an
existing owner; it must use the separate ownership-challenge process.
