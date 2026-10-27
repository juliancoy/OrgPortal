# Events and organizations on slow connections

The distributed `visual` suite calls `web/scripts/slow-connection-checks.mjs`.
It runs the real list and detail components against a disposable local HTTP
server with synthetic data. No production account or data is used.

The fixed Slow 4G profile uses 150 ms latency, 1.6 Mbit/s download and
750 kbit/s upload. Chromium throttles actual HTTP transfers, including the
minified gzip fixture JavaScript, CSS and API responses. A 96 KiB random-data
probe must take at least 400 ms, which detects ineffective emulation. Request
routing is deliberately avoided because Playwright routing disables HTTP caching.
The fixture assets have explicit cache lifetimes for repeat-visit checks.

Run the focused browser checks from the repository root:

```sh
npm --prefix web run test:slow-network
```

The checks cover:

- Cold loads and repeat visits for organization and event directories and details.
- First visible content within a generous 15-second regression budget. This is
  an availability guard across fleet machines, not a production performance target.
- Rendering the first 500 organizations while a deliberately delayed second page
  is still pending; all 501 records remain available after it finishes.
- Reusing the fresh persisted organization directory without another API request.
- An event-feed HTTP failure displaying an error rather than a false empty list.
- Mobile overflow and uncaught browser errors.

`slow-connection.json` is published with the distributed visual artifacts. It
records first-content time, directory completion time, observed paint and layout
shift values, and resource start times, durations and transfer sizes. Paint
observations stop at content readiness and are not finalized Core Web Vitals.
Screenshots are saved in the local `slow-connection/` subdirectory to keep the
published artifact count within the existing limit.

The fixture bundle combines routes differently from the production Vite build.
Use these timings for reproducible regression checks, not claims about production
load time or a substitute for profiling production bundles, API queries and images.

## Implemented improvement

The organization directory previously waited for every sequential 500-record
page before rendering the list. It now publishes accumulated validated pages to
the UI immediately while completing the directory in the background. Existing
shared caching, complete results and ranking are preserved. A late page failure
keeps the already loaded organizations visible and displays the error.

One local synthetic run at the specified profile displayed organizations in
3.2 seconds while full pagination took 5.7 seconds. Repeat-visit content was
visible in 0.2–0.4 seconds across the four pages. These numbers are illustrative
local measurements, not fleet or production results.

## Next improvements to measure

1. Paginate the event feed instead of fetching up to 500 events before rendering;
   load the visible page first and fetch older events when requested. Preserve the
   grouping and completeness contract rather than silently reducing the limit.
2. Batch registration status: `PublicEventsPage` currently requests attendance
   separately for every event after the list arrives. A batch response for visible
   events would reduce request count on signed-in visits. These visitor fixtures
   do not measure signed-in attendance latency.
3. Use a compact organization directory response. The API currently selects
   `o.*` and calculates multiple activity counts per organization. Measure query
   cost and payload size before narrowing the response or adding aggregate caches.
4. Profile the production request chain before changing route prefetch or bundle
   splitting. The fixture transfer was dominated by its combined JavaScript;
   production already uses lazy route modules and needs separate measurements.
