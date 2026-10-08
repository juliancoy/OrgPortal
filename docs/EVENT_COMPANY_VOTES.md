# Company voting at pitch events

The public event page shows a company voting section only for events with an
`event_company_ballots` configuration. Migration `0080_event_company_votes.sql`
configures the live Amplify MedTech October 8, 2026 competition (event ID
`15dc061b-d8a5-4cc5-ad94-e9a704c24b01`) and its five existing organization records:
BlueHealer, Salynt, Liquet Medical Inc., Rubitection Inc. and WearableDose.
The event and identities were verified through LifeTech's remote public API.

Signed-in portal users can independently upvote or downvote each pitching
company. Selecting the same direction again clears the vote. A unique database
key prevents duplicates; the actor comes from the existing member sign-in.
Community totals are public, individual preferences are visible only to their
voter. Voting closes one week after the event, at 8 p.m. America/New_York on
October 15, 2026; clearing remains
available afterwards. These preferences are independent of venue selection,
formal governance ballots, corporate ownership and pitch judging.

API paths below are relative to `/api/org` on the public site:

- `GET /api/network/events/:eventId/company-votes/public`: totals and deadline.
- `GET /api/network/events/:eventId/company-votes`: authenticated saved votes.
- `PUT /api/network/events/:eventId/company-votes/:companyId`: authenticated
  `{ "value": 1 }`, `{ "value": -1 }`, or `{ "value": 0 }` to clear.

The roster and enabled/deadline checks execute atomically with each vote write.
Disabling the ballot or removing a company prevents further votes. Removing
roster entries cascades their votes. Expired votes are excluded immediately;
bounded scheduled cleanup removes them. See the privacy inventory and policy.

Release migrations 0080 and 0081 before deploying the Worker API and shared portal
web bundle through CodeCollective's existing release path. Do not release this
shared feature using MedTech's static-site deploy. Verify the seeded roster has
exactly five entries and the closing time is `2026-10-16T00:00:00Z`. This migration
does not create or edit the underlying organizations or event.

Validation: `npm --prefix org-worker test`, `npm --prefix org-worker run typecheck`,
`npm --prefix web run test:company-votes`, and `npm --prefix web run build`.
The browser check uses only synthetic local fixtures and runs headlessly.
