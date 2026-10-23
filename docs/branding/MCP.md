# Organization branding through MCP

Branding uses OrgPortal's organization profiles, media gallery and portal
configuration. No separate asset-hosting project is required.

## Images

1. Call `preview_organization_image_upload` with `organizationId`, `dataBase64`,
   `contentType`, and optional `label` and `alt` text. Supported types are PNG,
   JPEG, WebP and GIF, up to 8 MB. The preview contains the proposed public URL,
   checksum, type and size, without echoing image bytes or uploading anything.
2. Call `apply_organization_image_upload` with the same input and the returned
   one-use `previewId`. The server checks live management permission, stores the
   image through its existing `SCAN_IMAGES` binding and updates the organization
   profile and gallery. Repeated identical images reuse the gallery entry.
3. Use the returned `organization.image_url` as `homeImageUrl` in
   `save_portal_setup` when it should also be the portal identity and cover.

Clients with the older profile tools can supply a direct public raster image
URL to `preview_organization_profile`, then apply the same patch with
`apply_organization_profile`. The server imports the bytes into native media
storage; the resulting profile does not depend on that external image host.
Linked SVG logos retain their existing URL behavior. Imports reject redirects,
private host literals, unsupported content and files over the upload limit.

Previews and applies retain the normal scope, authorization, concurrency and
receipt checks. Image bytes are never stored in the operation receipt. If an
apply loses permission or the profile changes while uploading, the profile write
fails and the unreferenced object from that attempt is removed when possible.

## Portal and palette

- `get_portal_setup` / `save_portal_setup`: name, tagline, accessible accent,
  approved imagery, homepage content and enabled sections.
- `get_portal_branding` / `preview_portal_branding` / `apply_portal_branding`:
  named palette colors, hex values and descriptions. Applying a palette requires
  its matching one-use preview and preserves other portal settings.
- `/orgs/:orgSlug?tab=branding`: the public Branding tab beside Info on each
  organization page, with approved imagery, copyable colors and PNG export.
  It reads that organization's existing portal/MCP settings without changing the
  surrounding portal identity. Organizations without portal setup use their
  profile image and the default palette.
- Existing `/portals/:portalSlug/branding` links redirect to the linked org tab,
  including when portal and organization slugs differ. Domain `/branding` links
  open the org tab when the domain has a linked organization. Other domain-only
  brand guides remain available.

These tools are advertised by OrgPortal's MCP server. Clients that cache the
tool list must refresh their connection to discover newly added tools.

## Verification

Run the affected organization MCP and palette tests, the route contract tests,
and TypeScript checks. For a local navigation, export and mobile-layout check:

```sh
PLAYWRIGHT_BASE_URL=https://localhost:9457 python3 web/scripts/test-local-brand-guide.py
```

This headless test uses synthetic portal configuration and only permits local,
read-only requests. It creates no real organization or account records.
