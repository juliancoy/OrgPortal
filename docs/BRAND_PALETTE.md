# Brand-guide palette

The brand guide reads `group_sites.feature_config.brandPalette`. Each entry has
`label`, six-digit hex `value`, and optional `description`. Stored palettes take
precedence over the shared defaults in `shared/brandPalette.ts`. LifeTech and
MedTech default to HealthTech Teal (the portal's existing accent), MedTech
OffWhite (`#F4F5F0`, inspired by MRI machines), and BioTech Gold (`#D4AF37`,
representing biotechnology's monetary potential).

Organization owners and administrators can use MCP without redeploying:

1. `get_portal_branding` with `organizationId` reads the effective palette.
2. `preview_portal_branding` with `organizationId` and the complete `palette`
   returns before/after and a one-use `previewId` without changing settings.
3. `apply_portal_branding` with the same `organizationId`, `palette`, and
   `previewId` saves it. Reload `/branding` to see the change.

Read requires `org:portal.read`; preview and apply additionally require
`org:portal.write`. Organization management permission is checked for all three.
Tenant MCP connections cannot access another organization's branding. Apply
rejects expired, reused, or stale previews and checks management permission
again in the write. Palettes contain 1–12 entries; labels are limited to 80
characters and descriptions to 300 characters. These are public brand settings.

Palette edits change the brand guide only. They do not change the portal's
accent/theme, routing, profile, or other feature configuration. No database
migration is needed.
