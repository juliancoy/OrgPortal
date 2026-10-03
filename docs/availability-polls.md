# Group availability polls

OrgPortal owns `/availability` and `/availability/:id`. MedTech mounts these routes through its existing tenant portal proxy and exposes a link in its Events navigation.

Members create polls using their existing PIdP login, then share the poll URL. Each poll contains a fixed set of UTC half-hour instants and an IANA display timezone. Organizers choose a date range (up to 14 days) and daily hours in their browser's local timezone. Respondents can switch the display timezone, select by mouse drag, keyboard, or mobile tap, and explicitly save or replace their own response. The overlap grid and best slots use saved responses. A closed poll remains readable; only its creator can close or reopen it.

Public reads expose aggregate counts, never participant identities or individual selections. Authenticated `/me` reads and writes use the validated PIdP identity. All poll lookups are scoped to the resolved portal tenant. Cross-tenant links return 404. A conditional SQL upsert refuses writes racing with closure.

## Release

Apply `org-worker/migrations/0042_availability_polls.sql` through the existing CodeCollective org Worker release, then release the shared CodeCollective site bundle from this OrgPortal commit. Finally deploy the MedTech route and navigation change. No PIdP or chat release is required. The migration creates two new tables and an owner-list index; it changes no existing data.

Run org Worker typecheck, tests and bundle check, plus web lint, tests and build. Focused API regressions cover anonymous write refusal, tenant boundaries, private responses, response replacement, validation, organizer-only closure and closed-poll save rejection.

## Task queue and invitations

The notification bell contains a tenant-scoped personal task queue. Tasks stay pending when notifications are read and disappear only on completion. Members can add and complete their own personal tasks through `/api/tasks`; no API request can assign a personal task to someone else.

Poll organizers can select existing portal members and assign the poll through `POST /api/availability/:id/invites`. Invitation and task writes are atomic and idempotent. Invited polls appear in the invitee's poll list. Saving a valid response, including an empty response meaning no proposed times work, completes the associated task atomically with the response. Closing a poll resolves its outstanding tasks; reopening restores tasks only for invitees who have not responded.

Polls continue to allow link access. The page displays the number of invited people, not a finite total for everyone who could follow a public link. Only the organizer can view the invitation roster or assign a poll. Public reads disclose aggregate invitation and response counts, never invitee identities.

Release the additive `0046_user_tasks.sql` migration and the org Worker before the frontend. It creates `user_tasks` and `availability_invites` without changing existing responses. Local browser acceptance: `python3 web/scripts/test-local-availability-tasks.py` against the local Docker gateway at `https://localhost:8443`; it keeps all accounts, sessions, and test polls local. Backend regressions cover queue isolation, completion permissions, invitation retries, invalid members, response privacy, and closure/reopening.

## Account availability and historical defaults

Saving a response also records every proposed half-hour on the authenticated user's account, including unselected slots as explicitly unavailable. Account entries are shared across that user's polls and portal tenants; poll reads still enforce tenant boundaries, and account history is visible only to its owner. Repeated edits to the same instant replace the account entry. Poll overlap counts and invitation completion continue to use explicit poll saves.

For weeks (Monday through Sunday in the device timezone) without any explicit account entries, personal selections default to the binary median for the same local weekday and half-hour in earlier weeks. More than half the observations must be available; ties and missing history stay unavailable. DST follows local time. Any explicit entry in a week disables inference for that week, including explicit unavailability. Later weeks are never used to predict earlier ones. Suggestions use dashed selection outlines and are not stored or counted as responses until confirmed with Save availability.

Release `0047_account_availability.sql` and the org Worker before the shared frontend. The migration imports existing responses with the most recent save winning conflicts, including empty responses. Focused regressions cover median/tie behavior, DST, week boundaries, privacy, cross-poll reuse, explicit negatives, closure, and migration preservation. Local authenticated acceptance and restart persistence: `python3 web/scripts/test-local-account-availability.py`.
