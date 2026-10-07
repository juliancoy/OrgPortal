# Network zoom visibility

The gear settings menu enables sparse-organization reveal by default. An organization is visible when:

`recorded transaction count × zoom² ≥ visibility factor`

The default factor is **4**, adjustable from **1 to 16**. Zoom is relative to the fitted graph overview (1×). Four recorded transactions qualify at overview; one qualifies at 2×. Higher factors require more records or more zoom. Selected organizations remain visible. Organizations with no records can be reached through search when the separate hide-unconnected filter is disabled, or shown by disabling sparse reveal.

Counts include incoming and outgoing graph-eligible relationship records in the loaded evidence, including fund capitalization when that option is enabled. A self-transaction counts once. They do not measure an organization's real activity or completeness of research. Counts are established before class and neighbor filtering so those filters do not change an organization's reveal threshold.

Visibility changes on render without re-running layout or resetting zoom. Both renderers hide node artwork, labels, incident edges, and interaction targets together. Reset restores sparse reveal and factor 4.

Live read-only check:

```sh
BROWSER_BINARY=/usr/bin/google-chrome node web/scripts/check-network-zoom-visibility.mjs
```

The browser check uses the saved public evidence snapshot to avoid a changing live API response during assertions.
