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

## Event gallery backgrounds

Choose **Event gallery** in the poster Background menu, then select an uploaded
image thumbnail. The selected image is embedded in preview, PNG, SVG and print
output for every poster format, with a dark overlay to keep text readable.
Externally linked gallery images are not offered; upload them to the event first.

The flyer endpoint accepts `background=gallery&mediaId=<event-media-id>`. It
resolves the ID only from the current event gallery and reads the existing R2
object directly. Supported formats are JPEG, PNG, WebP and GIF up to 8 MiB.
Missing images return 404; unsupported formats or oversized images return 400.
No new image copies or data stores are created.
