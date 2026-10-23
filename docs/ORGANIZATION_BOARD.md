# Organization Board and roles

Every organization has Info, Board and Branding tabs. `/orgs/:slug?tab=board`
shows active members with assigned titles, including officers, specialists and
advisors. "Board" is the public people-and-roles view. Titles are independent of
Member, Organizer and Owner access levels. Several people can share a title,
and a person can have up to eight titles.

Organizers use **Edit roles** on a member, enter one title per line, review the
public assignment, and save. Existing permission levels remain intact, including
when editing the owner's titles. Clearing all titles removes the Board card.
The same controls work in the organization dashboard. Accounts can be found and
added using the existing member directory and email invitations.

MCP tools:

- `lookup_portal_people`: authenticated directory search by name or email,
  requiring management access to `organizationId`. Returns explicit canonical
  account IDs. A connection refresh may be needed to discover new tools.
- `preview_organization_member_titles`: `organizationId`, `user_id`, `titles`.
- `apply_organization_member_titles`: same fields, `previewId`, `confirm:true`.
- `list_organization_members`: includes each member's `titles`.

REST uses POST `/api/network/orgs/:id/members/:userId/titles/preview` and `/apply`
with the same one-use receipt and live permission checks. A public read-only
projection is available at `/api/network/orgs/public/:slug/board`. Contact details,
private portraits and canonical account IDs do not appear in that projection.

Migration 0102 is additive: existing memberships get an empty title list. Old
Workers ignore the added field, so rolling back code preserves assignments.
Review/apply the migration separately before deployment. See the privacy policy
for membership deletion and backup restoration handling.
