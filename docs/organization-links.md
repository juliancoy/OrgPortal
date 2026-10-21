# Organization Links

`organizations.links_json` is the single writable source for an organization's
public links. Administrators manage an ordered list in Organization Links in the
organization settings. Each entry has a stable ID, a popular service type, an
HTTPS URL and an optional label. Multiple entries of the same type are supported.
The shared catalog covers website, WhatsApp group, Luma, Eventbrite, LinkedIn,
Instagram, Facebook, Discord, Telegram, YouTube and GitHub.

The profile PATCH API and the profile MCP preview/apply flow accept `links`.
Omitting it preserves the list; `links: []` clears it. IDs and URLs must be unique.
Public organization profiles expose `links`, and event responses expose their
hosting organization's `organization_links`. The organization page and social
dock render those records directly; tenant configuration and code constants are
not alternative sources.

Posters save `org-link:<id>`, never a copied URL. The SVG endpoint resolves the
current host organization link by ID and disables caching for these destinations.
A removed link falls back to the event page. Native chat and event links remain
available. The previous local `whatsapp` destination remains a read-only alias
for the organization's first WhatsApp link.

Migration `0092_organization_links.sql` replaces the earlier, unapplied WhatsApp
migration. Review and apply it separately before deploying the primary and its
replicas. It extends audit coverage, migrates legacy tenant social settings, and
preserves old MedTech dock defaults only for explicitly associated organizations.
Unmapped legacy configuration remains for review. Version-3 replication snapshots
without the new field remain readable and produce an empty list.

These are public organization metadata. Live records follow organization
removal; journal and backup history follows the existing retention policy.
No production migration or organization configuration change is part of this
local implementation.
