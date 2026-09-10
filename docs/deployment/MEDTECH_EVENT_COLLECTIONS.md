# MedTech event collections

The MedTech profile now exposes two separate destinations:

- **MedTech Events**: `/p/medtech-events`, listing native OrgPortal events hosted
  by the configured MedTech organization. The community home uses the same source.
- **General Calendar**: `https://medtech.social/calendar.html`, showing medically
  related events from the wider Code Collective calendar.

The general feed's medical keyword filter does not establish ownership. It is
never used as a fallback for the owned-event view. Empty owned results are shown
as empty, and network failures are reported. OrgPortal is the sole event system
for Baltimore MedTech; Luma is retired and is not linked or used for registration.

Set `VITE_MEDTECH_ORGANIZATION_SLUG` to the verified public slug of the MedTech
organization before building the portal. The default is `baltimore-medtech`.
The organization-scoped endpoint resolves that slug to its database ID and filters
events by `host_org_id`; it applies `upcoming_only=true` before limiting results.
This presentation setting grants no permissions. Check the organization's actual
identity and management permissions before publishing records under it.

At implementation time, the deployed public organization search returned no
MedTech organization. No organization or native event was created as part of
these source changes. The default slug therefore remains a configuration value
to verify, not a claim that the organization already exists in production.

## Formational event and MCP readiness

The featured native event is planned as:

- Name: MedTech Formational Event
- Native slug: `medtech-formational-event`
- Planned start: September 29, 2026; preserving the intended duration gives
  `2026-09-29T22:00:00Z` through `2026-09-30T00:30:00Z`.

Create the native event under the verified MedTech organization and use the
OrgPortal registration flow. The featured card is intentionally visible to both
guest and signed-in visitors before the native record is published. Do not create
or maintain a duplicate external event. Palava Hut should be added as a portal
collaborator only after resolving their portal account.
