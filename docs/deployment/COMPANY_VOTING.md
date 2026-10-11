# Event company voting

Company rosters and ballot deadlines belong to OrgPortal. Company cards use the
organizations’ current descriptions and images. Voting remains open through the
configured deadline; changing modes keeps that deadline.

Modes:

- `up_down`: one upvote or downvote per account per company.
- `favorites`: select up to `ceil(roster size × selection_fraction)` companies.
  The fraction defaults to `0.25` and accepts numbers greater than zero through
  one. Five companies therefore permit two favorites. Rounding is always upward.
  Select a card to save immediately; a saved card turns blue and is announced as
  selected to assistive technology. Select it again to deselect. There are no
  downvotes, and the server rejects selections beyond the budget atomically.

The two modes store preferences separately. Switching modes neither deletes nor
reinterprets old votes. Returning to a mode restores its unexpired preferences.
A fraction reduction that would invalidate saved favorites is rejected. Rosters
are shared; removing a company cascades its preferences. Counts follow the live
roster. Adding companies increases the budget as needed. Future roster-removal
workflows must preserve a sufficient budget or explicitly review affected votes.

Public totals contain no voter identities. Authenticated reads return only the
caller’s preferences. Both modes expire preferences 90 days after ballot close,
exclude expired records immediately, and use the bounded hourly cleanup. Clearing
is permitted after close. Preferences are excluded from public replication and
immutable change journals; mode and fraction changes are journaled.

## API and MCP

The existing `/api/network/events/:id/company-votes` routes support both modes.
Public summaries include `mode`, `selection_fraction` and `selection_limit`.
PUT `/:companyId` accepts `{value, mode}`: in favorites mode use `1` to select or
`0` to clear. Mode guards reject stale clients; omitted mode means `up_down`.
Writes return current totals and the caller’s saved `votes`.

MCP exposes `get_event_company_votes`, `preview_event_company_ballot`,
`apply_event_company_ballot`, `preview_event_company_vote`, and
`apply_event_company_vote`. Every tool uses explicit `organizationId` and
`eventId`, the connection’s tenant boundary, and event scopes. Configuration
requires live host-organization management permission or verified primary operator
status from PIdP introspection. A website session never inherits operator access. Voting always uses the
authenticated caller and never accepts an arbitrary voter ID. Writes require
`confirm=true` and an exact, expiring, one-use preview receipt.

Tenant MCP connections are restricted to their configured organization. For an
organization outside that exact tenant, use the global OrgPortal connection;
live management permissions still apply.

Sign in to the global resource, then preview Amplify’s ballot:

```sh
orgportal auth login --admin --portal https://orgportal.cc --connection admin
node org-worker/scripts/company-ballot.mjs --resource https://orgportal.cc/api/org/mcp \
  --connection admin --organization org-amplify-medtech \
  --event 15dc061b-d8a5-4cc5-ad94-e9a704c24b01 --mode favorites --fraction 0.25
```

Review the returned preview, then repeat those exact options with
`--apply --preview-id UUID`. Use `--get` to read back the configuration and
own preferences. This CLI uses MCP, keyring credentials and live permissions;
it never writes production organization rows directly through D1.
