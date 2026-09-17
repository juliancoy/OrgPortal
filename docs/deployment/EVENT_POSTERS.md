# Event posters

The public event page and organization event administration expose **Create
poster**. Generation uses the saved event, current tenant branding and its
canonical public event URL. Opening a poster does not change the event or its
social metadata and does not require an account for an already-public event.

The shared renderer lives in `org-worker/src/eventPoster.ts`; the existing
`/api/network/events/public/:slug/flyer.svg` route remains compatible.
`web/src/ui/components/EventPosterTools.tsx` supplies format selection, a loading
preview, retry, SVG download, PNG export, and print. Previews load only after
opening the tool. Changed event revisions invalidate the preview URL.

Formats:

- Letter: 8.5 x 11 inch SVG/print; 2550 x 3300 pixel PNG.
- Letter 2 x 2 (`format=letter-4up`, alias `2x2`): four identical posters on one
  portrait US Letter sheet; 2550 x 3300 pixel PNG. Quarter-inch outer margins
  and a 0.2-inch gutter leave each un-stretched poster 3.9 x approximately
  5.05 inches. Each copy includes its own branding, event details, and QR code.
- Postcard: 4 x 6 inch SVG/print; 1200 x 1800 pixel PNG.
- Social: 1200 x 630 pixel SVG/PNG.

Print opens a dedicated image-only document with the selected page size. Actual
printer margins and scaling remain controlled by the browser/printer dialog.
PNG downloads are raster exports; use Print or SVG for physical page sizing.
SVG is not a universally supported social-card image format, so the old shortcut
that assigned the generated SVG as social metadata was removed. PNG can be
downloaded for sharing; this feature does not publish a hosted PNG social card.

Posters use high-contrast text on white, wrap dates and venues, reduce long-title
type sizes within bounds, and reserve a separate QR area with a quiet zone. Dates
retain the event platform's America/New_York timezone and show its abbreviation.
Descriptions may be shortened when the format cannot fit the complete copy;
the QR links to full event details. Arbitrary text is XML-escaped.

Brand logos are loaded only from the configured tenant's HTTPS origin under
`/images/`, with no redirects, a five-second timeout, a 512 KB limit and raster
MIME types. The logo is embedded in the SVG so browser PNG export is self-contained.
Unavailable logos fall back to the tenant/host wordmark, not another tenant's logo.

Verification:

```sh
cd org-worker
node --import tsx --test test/event-poster.test.ts test/org-worker.test.ts
cd ../web
node --import ../org-worker/node_modules/tsx/dist/loader.mjs scripts/check-event-posters.mjs
PLAYWRIGHT_PORT=4189 npx playwright test tests/e2e/tenant-routing.spec.ts --grep 'poster workflow|poster failures'
```

The visual audit renders all four formats with normal and long copy, checks SVG
text bounds and overlap, and decodes each rasterized QR back to the canonical
event URL. Screenshots default to `/tmp/orgportal-posters`. Browser tests cover
desktop/mobile preview selection, PNG dimensions, SVG downloads, single-page PDF
paper dimensions (including US Letter for the four-copy sheet), printing and
failure/retry. The operating-system print dialog itself is not automated.

Release the backend and shared frontend through CodeCollective. MedTech owns
its brand assets; no parallel generator or event service belongs in that checkout.
