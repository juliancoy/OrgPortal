# LifeTech poster backgrounds

LifeTech event poster tools offer **LifeTech plain artwork** in the Background selector. The existing text-free LifeTech hero is embedded in exported SVGs; portrait layouts retain the complete image at the bottom and use a matching dark background above it. Completed posters add an overlay to keep event text readable.

Select a format and **Background PNG** to download artwork without event text, branding text, or a QR code:

| Format | PNG dimensions |
| --- | --- |
| US Letter, 8.5 × 11 inches | 2550 × 3300 |
| Letter, four copies | 2550 × 3300 |
| Postcard, 4 × 6 inches | 1200 × 1800 |
| Social | 1200 × 630 |

The existing public flyer endpoint accepts `background=lifetech&backgroundOnly=true`. Background images remain embedded rather than externally referenced, and failed artwork loading returns an error instead of an unbranded blank export.

Verify the live browser controls and PNG dimensions with:

```sh
BROWSER_BINARY=/usr/bin/google-chrome node web/scripts/check-lifetech-poster-backgrounds.mjs
```

`POSTER_ORIGIN` and `POSTER_EVENT` override the default LifeTech host and October 20 event.

## Event and organization images

Choose **Event & organization images** in the Background menu. The picker combines:

- The current event's gallery, cover, and social images.
- Gallery and profile images from the host organization and every attached organization.
- Gallery, cover, and social images from other events hosted by or attached to those organizations, including past events.

Each thumbnail names its source. Duplicate images are shown once. Uploaded
JPEG, PNG, WebP, and GIF files and saved public HTTPS image links are supported,
up to 8 MiB. Remote redirects, SVGs, private/local addresses, credential-bearing
URLs, and unsupported content are rejected. A failed image produces an error;
it is never silently replaced. PNG, SVG, print, and every format use the same
embedded image and contrast overlay.

`GET /api/network/events/public/:slug/poster-images` returns the current catalog.
Pass its scoped `id` as `mediaId` with `background=gallery` to the flyer endpoint.
The server rebuilds the catalog when exporting; IDs from unrelated organizations
or removed associations return 404. Legacy event-only media IDs still work.
Clients cannot provide arbitrary image URLs or R2 keys. No image copies or new
data stores are created. Images are public, consistent with the existing public
organization and event galleries.
