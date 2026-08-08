# Identity and Access Management

## Purpose

Code Collective uses a permissive identity and access model. Authenticated people should be able to participate without waiting for an administrator, while ownership changes and sensitive actions remain explicit and auditable.

The identity provider establishes who a person is. The portal decides what that person may do.

## Principles

1. Public information is readable without authentication unless it contains private member data.
2. Any authenticated person may create records, contribute information, join open organizations, and use member services.
3. Authority comes from explicit relationships to a record, not from hidden UI rules.
4. The current ownership record is authoritative until an ownership challenge is filed.
5. A challenge makes ownership disputed; it does not silently replace or delete the current owner.
6. Every ownership, permission, moderation, and financial action is recorded in an append-only audit log.
7. Health records, beneficiary information, private messages, credentials, and other private member data are exceptions to the permissive public default.

## Identities

Every authenticated person has one stable `user_id` supplied by the identity provider. Names, email addresses, and avatars are profile attributes and must not be used as identifiers.

An account may act as:

- A person acting for themselves.
- A member of an organization.
- The current owner of an organization.
- A platform operator handling disputes and operational failures.
- A platform administrator maintaining system configuration.

System-wide roles are deliberately small:

- `member`: the default for every authenticated person.
- `operator`: may resolve challenges and operational review items.
- `admin`: may manage operators and system configuration.

Organization authority is represented by organization membership, not by system-wide roles:

- `owner`: controls the organization and its membership.
- `administrator`: manages the organization except for ownership transfer.
- `member`: participates in the organization.

## Organization Creation and Claiming

Any authenticated person may create an organization. Its creator immediately becomes its owner.

Organizations imported from public sources begin unclaimed. Any authenticated person may claim an unclaimed organization. The first successful claim immediately becomes the authoritative ownership record. No prior approval is required.

Claiming must be atomic:

1. Confirm that the organization is currently unclaimed.
2. Create an active `owner` membership for the claimant.
3. Record the ownership claim.
4. Append an audit event.
5. Return the organization with its new owner.

Two simultaneous claims cannot both succeed. The database condition that the organization remains unclaimed decides which claim is first.

## Ownership Challenges

Any authenticated person may challenge the current ownership of an organization. A challenge must contain a short explanation and may contain supporting links or attachments.

Filing the first open challenge changes the organization's ownership status from `claimed` to `disputed`. The incumbent remains the operational owner while the challenge is open, but the ownership is presented as disputed anywhere ownership is displayed.

While disputed, the incumbent may continue ordinary organization operations. The following actions are held until the challenge is resolved:

- Transferring ownership.
- Deleting the organization.
- Removing the organization's complete audit history.
- Closing the organization's treasury account.

Ordinary Dena payments and member administration remain available and fully audited.

A challenge ends when one of the following occurs:

- The challenger withdraws it.
- The incumbent accepts it, transferring ownership to the challenger.
- An operator resolves it for the incumbent.
- An operator resolves it for the challenger and transfers ownership.

Resolving a challenge must never rewrite history. The old ownership record is closed, a new ownership record is created when necessary, and a resolution audit event links both records.

Multiple people may support either side of a challenge. Support is advisory and visible; it does not automatically transfer ownership.

## Default Permissions

Unauthenticated visitors may:

- Read public organization profiles, public events, and public discussions.
- Search public people and organizations.

Authenticated members may:

- Do everything available to unauthenticated visitors.
- Create organizations and events.
- Claim an unclaimed organization.
- Challenge an ownership claim.
- Join organizations that use open membership.
- Request membership in organizations that use approved membership.
- Participate in chat and public discussions.
- Use their own Dena, UBI, life-benefit, and health-benefit records.
- Submit information or support where a subsystem explicitly permits community participation.

Organization members may:

- View member-only organization content.
- Participate in organization discussions and activities.

Organization administrators may:

- Edit the organization profile.
- Create and manage organization events, services, and programs.
- Manage membership.
- Act from the organization treasury within organization policy.

Organization owners may:

- Do everything organization administrators may do.
- Appoint and remove organization administrators.
- Change membership policy.
- Transfer ownership when no ownership challenge is open.
- Respond to ownership challenges.

Operators may:

- Resolve ownership challenges.
- Review failed or disputed workflows.
- Suspend a specific capability when necessary to keep the platform operating.

Administrators may:

- Appoint and remove operators.
- Change system configuration.
- Perform operator actions.

## Private Records

Private member records are accessible only to:

- The member who owns the record.
- A person receiving an explicit, revocable access grant.
- An operator performing a recorded operational action supported by the subsystem.

Public participation in a health assessment does not grant access to the patient's private record. Contributors see only the information deliberately placed on the collaborative assessment board.

Beneficiaries and next-of-kin may be searchable member references without making the member's complete life-benefit enrollment public.

## Authorization

Every protected API route must call one authorization function with:

```text
authorize(actor, action, resource)
```

Authorization is decided from:

1. The actor's system role.
2. The actor's active relationship to the resource.
3. The resource's visibility or membership policy.
4. Any active record access grant.
5. The resource's current workflow state, including ownership disputes.

Frontend controls may explain or hide unavailable actions, but the API is the authority.

## Required Data Model

```text
organization_memberships
  organization_id
  user_id
  role
  status
  created_at
  updated_at

organization_ownerships
  id
  organization_id
  owner_user_id
  status
  started_at
  ended_at

organization_ownership_challenges
  id
  organization_id
  ownership_id
  challenger_user_id
  explanation
  evidence_json
  status
  resolution
  resolved_by_user_id
  created_at
  resolved_at

organization_ownership_challenge_support
  challenge_id
  user_id
  position
  created_at

record_access_grants
  id
  owner_user_id
  grantee_user_id
  resource_type
  resource_id
  permission
  created_at
  revoked_at

audit_events
  id
  actor_user_id
  action
  resource_type
  resource_id
  subject_user_id
  metadata_json
  created_at
```

Use database uniqueness constraints for single active ownership, one membership per person and organization, and one support position per person and challenge.

## Audit Requirements

At minimum, audit:

- Organization creation and claiming.
- Challenge creation, support, withdrawal, and resolution.
- Ownership transfers.
- Role and membership changes.
- Access grants and revocations.
- Organization treasury transfers.
- Administrative and operator actions.

Audit records are append-only. Corrections are new events that refer to the incorrect event.

## Implementation Rule

Permissions should remain explicit and permissive. Add a restriction only when it protects private member data, prevents an irreversible action, preserves funds, or maintains an active dispute. Do not add approval gates to ordinary participation.
