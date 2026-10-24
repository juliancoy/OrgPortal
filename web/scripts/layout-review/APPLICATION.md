# Application layout review

From `web/`, run:

```sh
node scripts/render-application-layouts.mjs ../artifacts/application-review/current
```

This renders the real EventPresentations component and portal styles in a disposable,
read-only local server with synthetic identity, organization, roster, and draft data.
It does not use real sessions or submit applications. No deployed service is changed.

The five states are new team, existing organization, edit application, guest, and
submission confirmation.
Each is captured at desktop and phone widths in light and dark themes, with labeled
contact sheets, a JSON manifest, and render reports. Inspect the PNGs after each change.
The fixture renders the dedicated application page and an isolated confirmation.
It does not cover the surrounding event page, authentication round trips, or writes.

The attachment helper has a case-sensitive filename collision with the attachments
component; the fixture resolver explicitly selects the lowercase `.ts` helper.

## Editorial application system

The application is one document, with a 42rem reading measure inside a 58rem
page. Presentation comes first, then the organization and shared roster, then
supporting files. Optional team description and image are under Team profile.
There are no progress badges or section cards; typography and quiet rules provide
hierarchy. The portal's existing sans-serif stack is used throughout, with its
real LifeTech mark. MedTech OffWhite is the light document surface; dark mode
uses charcoal with a slightly lighter field surface. BioTech Gold is reserved
for the main action and keyboard focus. Component tokens live in
`src/ui/views/public/event-application.css`; palette overrides come from
`src/config/applicationBranding.ts`.

For behavioral checks against the already running isolated Docker form stack:

```sh
PLAYWRIGHT_BASE_URL=https://localhost:19458 \
ONBOARDING_PIDP_CONTAINER=common-form-test-identity-api \
~/global/bin/python scripts/test-local-presenter-application.py
```

This creates synthetic local accounts and an event, verifies only the newly
created fixture identities in that test database, then exercises required fields,
new-team and existing-organization flows, invitations, image and attachment
uploads, failed-upload retry, draft reload, editing, confirmation focus, and guest
access. Desktop/phone captures and scoped WCAG checks run in both themes.
Requests are limited to loopback and replication must be disabled. Account
verification is restricted to test container names and exact fixture UUID/email;
no real account session or external delivery is used.
