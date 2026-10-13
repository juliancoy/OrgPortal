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
- Gallery and profile images from the event’s host organization.
- Gallery, cover, and social images from completed events hosted by that same organization. Calendar associations alone do not qualify, and future events are excluded.
- Public Google Drive image links and photo folders saved in those galleries or event links. LifeTech’s existing public community photo album is included only for LifeTech-hosted events.

Each thumbnail names its source. Duplicate images are shown once. Uploaded
JPEG, PNG, WebP, and GIF files and saved public HTTPS image links are supported,
up to 8 MiB. Drive file share links resolve to Google image previews; folders expand through the existing public album reader (including image previews of HEIC photos). Private Drive files remain inaccessible and no Google credentials are used. Remote redirects, SVGs, private/local addresses, credential-bearing
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

### Zoom and position

Photo and artwork backgrounds have Zoom (100–300%), Horizontal position, and
Vertical position sliders, plus Reset image. Selecting a different image resets
its crop. The preview updates after a short pause; PNG, SVG, print, four-up, and
plain-background downloads use the same crop. Only the background image moves;
text, logos, overlays, and the RSVP code stay fixed. Images are clipped to their
artwork area. Moving an image beyond the edge reveals the background color.
The flyer API accepts bounded `zoom` (1–3), `offsetX`, and `offsetY` (−100–100).
