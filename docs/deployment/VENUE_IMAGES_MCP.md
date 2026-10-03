# Venue avatars through OrgPortal MCP

`preview_venue_image_changes` and `apply_venue_image_changes` update only an organization-owned venue's `image_url`, `image_source_url` and `image_credit`. They use existing event OAuth scopes, live organization management authorization and one-use event operation receipts. Tenant resource organization limits still apply. A preview includes the existing fields; changes to those fields invalidate the receipt. The SQL write also checks ownership and prior values atomically. Operation status remains available through `get_event_operation`.

Research plans contain public source URLs and credits, never credentials. Example:

```sh
cd org-worker
node scripts/venue-images.mjs --file data/lifetech-venue-avatars-2026-10-03.json
node scripts/venue-images.mjs --file data/lifetech-venue-avatars-2026-10-03.json --apply
```

The CLI reuses the existing browser-bound member OAuth connection and OS keyring. Apply displays every preview and asks for interactive confirmation. No image files are fetched by the Worker. No schema migration is needed beyond the existing venue details migration (0052). Release shared Worker changes through CodeCollective with deployed variables preserved.
