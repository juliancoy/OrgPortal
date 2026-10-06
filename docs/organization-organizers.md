# Organizer assignments

Organization owners and organizers can search accounts in Community members,
choose **Assign organizer**, review the account ID and proposed permissions, and
confirm. Matching names or email addresses never merge or authorize accounts.
Search removes repeated rows only when their exact account IDs match.

For an organization whose home tenant enables onboarding (currently LifeTech),
an incomplete checklist produces an **Organizer pending onboarding** nomination.
The account receives active member permissions only. Completing onboarding marks
the nomination ready; an existing organizer must review and confirm **Activate
organizer** to grant administrator permissions. Existing active organizers retain
their permissions when nominated again. Owners cannot be reassigned here.

The website uses `POST /api/network/orgs/:id/members/preview` followed by
`POST /api/network/orgs/:id/members/apply` with the unchanged payload and its
one-use `previewId`. These routes share the MCP permission and receipt checks.
Onboarding changes invalidate outstanding previews. The underlying membership
write also enforces the onboarding gate, including direct API writes.

Migration `0067_pending_organizers.sql` stores nominations on the canonical
membership row. Nomination and onboarding state are authenticated data and are
not included in public replication or the public IndexedDB report cache.
