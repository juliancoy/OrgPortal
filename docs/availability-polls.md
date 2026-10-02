# Group availability polls

OrgPortal owns `/availability` and `/availability/:id`. MedTech mounts these routes through its existing tenant portal proxy and exposes a link in its Events navigation.

Members create polls using their existing PIdP login, then share the poll URL. Each poll contains a fixed set of UTC half-hour instants and an IANA display timezone. Organizers choose a date range (up to 14 days) and daily hours in their browser's local timezone. Respondents can switch the display timezone, select by mouse drag, keyboard, or mobile tap, and explicitly save or replace their own response. The overlap grid and best slots use saved responses. A closed poll remains readable; only its creator can close or reopen it.

Public reads expose aggregate counts, never participant identities or individual selections. Authenticated `/me` reads and writes use the validated PIdP identity. All poll lookups are scoped to the resolved portal tenant. Cross-tenant links return 404. A conditional SQL upsert refuses writes racing with closure.

## Release

Apply `org-worker/migrations/0042_availability_polls.sql` through the existing CodeCollective org Worker release, then release the shared CodeCollective site bundle from this OrgPortal commit. Finally deploy the MedTech route and navigation change. No PIdP or chat release is required. The migration creates two new tables and an owner-list index; it changes no existing data.

Run org Worker typecheck, tests and bundle check, plus web lint, tests and build. Focused API regressions cover anonymous write refusal, tenant boundaries, private responses, response replacement, validation, organizer-only closure and closed-poll save rejection.
