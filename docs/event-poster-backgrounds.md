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
Vertical position sliders, plus Reset image. Crop and opacity are retained when switching images. The preview updates locally on the next animation frame; PNG, SVG, print, four-up, and
plain-background downloads use the same crop. Only the background image moves;
text, logos, overlays, and the RSVP code stay fixed. Images are clipped to their
artwork area. Moving an image beyond the edge reveals the background color.
The flyer API accepts bounded `zoom` (1–3), `offsetX`, and `offsetY` (−100–100).

### Individual elements

Click an element in the preview to select it and open its controls, or open
**Adjust text and other elements** and choose it from the list. Then change its
visibility, size (25–300%), or horizontal/vertical position. Controls cover the
logo, organization name, tagline, title, date, time, location, description,
RSVP code with its label, invitation, and website. Reset one element or all.
Hidden elements keep their original layout space, so other elements do not jump.
Changes are saved locally per event and apply to all poster exports, including four-up;
they do not edit event details. Elements that lack source content remain absent.
The API accepts an `elements` JSON object keyed by these element IDs, with
`hidden`, `scale`, `x`, and `y`. Position is a percentage of the poster dimensions;
values are bounded and unknown element IDs are ignored. Four-up copies clip
custom layouts to each individual poster.

### Opacity, persistence, and live rendering

Background image opacity is adjustable from 0–100%; the underlying paper remains unchanged. Background dimming separately controls the
contrast overlay from 0–100%; choose 0% for full image brightness with no dark
overlay. Dimming defaults to 66% for readable text and is also saved locally. The flyer API accepts `opacity` (0–1),
clamped with a default of 1, including plain-background exports.

Format, theme, background, selected gallery image, zoom, position, opacity, dimming,
selected element, poster link destination, and all element layouts are stored in localStorage under
`orgportal:poster:v1:<event slug>`. Storage is scoped to the website origin and
browser, not synced between devices. Reset all settings restores defaults for
this event; Reset image and element resets remain available. Invalid stored
values are bounded or discarded. Blocked/full storage shows a message and does
not prevent editing. No event content, image bytes, or credentials are stored.
These preferences remain until reset or browser site data is cleared; they have
no server copy or backup.

The preview fetches a base SVG only when content, format, theme, or selected
background changes. Sliders update the retained SVG on requestAnimationFrame,
without network requests, SVG re-decoding, or rebuilding image data. This uses
the browser's native vector renderer rather than adding a WebGL texture pipeline;
GPU acceleration is browser-dependent. A restricted SVG vocabulary and shadow
root keep active content, remote resources, page styles, and IDs isolated. PNG,
SVG, and print serialize the same current layout, including edits made just
before export. Four-up copies share the same editable source artwork.

Local fixture browser check: `cd web && node --import ../org-worker/node_modules/tsx/dist/loader.mjs scripts/check-poster-editor.mjs` (install Playwright Chromium first, or set `BROWSER_BINARY`).

### Poster link destination

The Poster link menu defaults to this OrgPortal event page and also lists the
event's associated source and saved links (such as Luma). The chosen URL is
encoded in the RSVP QR code and its hostname is printed in the website element.
The choice persists with the other local settings. If the association is removed,
the editor falls back to OrgPortal. The server validates the `link` query parameter
against that event's current source and links, allowing HTTP(S) without credentials;
unassociated or unsafe URLs cannot replace the QR destination.

The flyer API also accepts `dimming` (0–1). Preview, SVG, PNG, and print use the same adjustable overlay.

## Canvas composition

The poster editor supports pointer/touch dragging and uniform corner resizing for
backgrounds, text, logos and QR codes. Sliders remain available for keyboard use.
`Fit image` preserves the whole image; `Fill canvas` crops to cover the canvas;
both reset zoom and position. `Center image` preserves zoom. Optional **Blur image
into empty edges** places an overscanned, blurred cover copy behind the sharp
image. Text stays sharp; dimming applies to both image layers. LifeTech artwork
now extends across the complete canvas, including behind the QR region.

These framing options follow JCut's `editor_scale_to_fill.h` and
`render_decode.cpp::buildBlurredFillBackground`: preserve the source aspect ratio
and use a separate cover-sized blurred image for uncovered areas. The SVG
implementation uses a local Gaussian blur instead of JCut's Qt/Vulkan paths.
Preview, PNG, SVG and print use the same composed artwork; editing handles are
removed from exports. Settings persist with the existing per-event browser
preferences. A four-up poster edits the shared source so all four copies match.

### Drop shadows

Select a text, logo, or QR element and enable **Drop shadow** in Element settings.
Each element has its own soft black shadow, saved with the event’s local settings.
Preview, PNG, SVG, print, and four-up exports use the same SVG filter. Reset element
or Reset all elements removes its shadow along with its other adjustments.

### Selection and text editing

Click an element to select it and reveal its editing controls. Clicking outside
the canvas keeps the current selection; choose another element or the empty
Element option to change or clear it. Text controls start with the rendered event
text, including location/address, and accept custom text and line breaks. Edits
are saved locally for this poster and included in every export; event details
and QR destinations are unchanged. Restore original text removes only the text
override. Element resets also restore the original text.
