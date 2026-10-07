# Public relationships loading

The relationships graph and organization reports share the browser's existing
`orgportal-public-organization-data-v1` IndexedDB database. Newsletter history
and pending edits remain in their separate transactional store.

The graph caches its two published JSON snapshots, public organization directory
pages and public relationship feed pages. Fresh entries are reused for five
minutes. Expired entries are revalidated; failed refreshes retain the saved data
and display its last checked time. Public fetches omit credentials. URL validation
rejects private endpoints, arbitrary query parameters and other origins.

`/api/network/relationships/public?offset=0` returns at most 500 published support
records and a `nextRecordOffset`, avoiding a support-report request for every
organization. It selects only `organization_support` records from the existing
public evidence view; account ledger records never enter the feed. It does not
write data or confer permission to edit it.

Route pages load on demand, so visiting the network does not load every other
portal view first. The local Vite deployment uses the same implementation as the
shared production frontend. Reload once after a code update; do not clear browser
storage, which may contain pending newsletter edits.

Local browser verification: `.local/network-performance.json` records cold,
warm and expired-cache/offline checks. A warm graph visit should make no network
requests for its data within the freshness interval.

The graph is a fixed viewport workspace; its wheel input zooms the graph. Events,
Relationships, and Sources & help are separate routes below `/ecosystem/network/`.
Those views scroll their content inside the viewport rather than scrolling the
document. The graph uses `ecosystem-relationships.json`, which preserves all
relationship evidence while omitting the full event history. Only the Events
view requests `ecosystem-history.json`. The history builder writes both files.

Run `npm run test:ecosystem:local` with the local portal running to verify desktop
and mobile sizing, wheel zoom, navigation, and the graph's lightweight requests.
The receipt is `.local/network-workspace-verification.json`.
