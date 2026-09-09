# MedTech event collections

The MedTech profile now exposes two separate destinations:

- **MedTech Events**: `/p/medtech-events`, listing native OrgPortal events hosted
  by the configured MedTech organization. The community home uses the same source.
- **General Calendar**: `https://medtech.social/calendar.html`, showing medically
  related events from the wider Code Collective calendar.

The general feed's medical keyword filter does not establish ownership. It is
never used as a fallback for the owned-event view. Empty owned results are shown
as empty, and network failures are reported. The existing Luma calendar remains
available as a separately labeled link; external Luma events are not silently
copied into the native directory.

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

Read-only Luma verification found the existing public event:

- Name: MedTech Formational Event
- Event ID: `evt-HcIBdMOolELnKgY`
- Owning calendar: `cal-eYi1l5x4I4xigDE` (Baltimore MedTech)
- Public page: https://luma.com/g3xzmy5h
- Observed start: September 17, 2026, 6 p.m. America/New_York
- Requested new date: September 29, 2026; preserving the observed duration gives
  `2026-09-29T22:00:00Z` through `2026-09-30T00:30:00Z`.

Do not create a duplicate Luma event. If the user's intent is to publish a native
portal counterpart, verify the owning organization first and retain its source
event URL/ID for reconciliation. That is distinct from changing the Luma record.

Both public MCP probes returned HTTP 501, with `Endpoint is not implemented in
the Cloudflare org worker`, at:

- `https://community.medtech.social/api/org/mcp`
- `https://codecollective.us/api/org/mcp`

No authenticated OrgPortal MCP connection was available in the agent's tools.
The committed MCP tools support listing, reading, previewing and updating
existing external events; they do not yet expose native event creation. Deploy
and connect the authenticated endpoint before attempting MCP event writes.
Follow `ORGPORTAL_CLOUDFLARE_HANDOFF.md`. Resolve Palava Hut's actual Luma account
before granting collaborator access. No event dates, branding or permissions
were changed during this task.
