# Portal name banners

A horizontal wordmark is stored separately from the square identity image in
`group_sites.feature_config.nameBannerUrl`. The header and sign-in panel use it;
the brand guide offers it as a separate downloadable asset. Favicons and compact
identity images continue to use the square logo.

To set one through MCP, upload the compressed PNG or WebP with alpha using the
existing multipart endpoint `/api/org/mcp/uploads/organization-media`. Preview
with `organizationId`, `image`, `label`, and `alt`, then submit the same image and
fields with the returned `previewId` and `confirm=true`. This requires a valid
MCP bearer token, portal read/write scopes, and organization management access.

Use the returned native media URL, resolved against the deployment's HTTPS
origin and `/api/org` prefix, as `nameBannerUrl` in `preview_portal_branding`.
Call `apply_portal_branding` with the same organization ID, URL, preview ID,
and `confirm=true`. Palette is optional; omit it to keep the existing palette.
Set `nameBannerUrl` to null through the same preview/apply flow to remove it.

Read-only local replicas reject uploads and MCP writes with HTTP 403. Configure
banners on the authoritative service, or use an isolated writable local fixture
for testing. Replica data must not be edited directly.
