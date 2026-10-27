# Public directory request scheduling

Organization pagination now publishes each validated saved page immediately while
its conditional refresh is pending. It still fetches every page and replaces the
preview with current results. A refresh failure remains visible; saved records
are not treated as proof of current membership or permissions. The existing public
organization cache and its invalidation behavior remain in use.

Public event feeds use a 60-second, 20-entry least-recently-used memory cache.
Equivalent query-parameter order shares one request; concurrent views join the
same in-flight request. A cancelled view stops waiting without aborting another
view's fetch. Responses are validated before caching and each caller receives
its own copy. Failed responses are never cached. Full reloads discard this cache.
Following feeds and registrations bypass it; public fetches omit credentials.
No new persistent store or server-side cache is introduced. A newly published
public event can take up to one minute to appear on an already-open browser's
repeat visit.

Registration reads prioritize upcoming events, then recent past events, with
four requests in flight at most. Each successful result becomes usable as soon
as it arrives instead of waiting for the entire directory. Cleanup stops queued
work and ignores old results after navigation or account changes. Registration
writes and private-feed authorization keep their existing behavior.

The synthetic Slow 4G checks (150 ms latency, 1.6 Mbit/s download) passed after
these changes: directory first content approximately 3.2 seconds and event-list
first content approximately 3.1 seconds; full-reload repeat views approximately
0.2–0.4 seconds. These checks include HTTP asset caching and existing organization
persistence. They do not isolate the new memory-cache gain or measure production
latency. Focused deferred-response tests verify that duplicate event requests
collapse to one and saved organizations render before revalidation completes.
