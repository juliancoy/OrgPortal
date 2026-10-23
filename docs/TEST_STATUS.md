# OrgPortal test status

Open `/test-status` from the account menu or Developer Tools. Categories and
individual suites expand independently. Each header is filled green, red and
gray in proportion to its passed, failed and not-run checks. Text counts and
status labels accompany every color. Submission and voting is one category in
the complete OrgPortal inventory.

The catalog includes automated test files and browser, Python, shell and manual
acceptance harnesses across this repository. A suite without a captured result
stays gray. Most suites report one whole-file check; the presentation API and
Docker form workflow also expose their individual recorded checks. Skipped tests
do not become passes. A changed source fingerprint invalidates earlier results
when the report is regenerated.

## Recording results

- `npm --prefix web run test:status -- applications-api attachments-api` runs and
  records selected suites. Omit the IDs to run all catalogued Node and Vitest suites.
- `npm --prefix web run test:forms:docker` records the real isolated local form,
  final-voting and test-dashboard checks for desktop and Pixel emulation.
- `npm --prefix web run test:status:checks` records API types and the frontend build.
- `npm --prefix web run test:status:refresh` republishes the current snapshot.
- `node scripts/build-test-catalog.mjs` updates the checked-in inventory after
  adding or removing tests. Frontend builds also update it in a full checkout.

Other harnesses can record a result after their actual command succeeds/fails:
start the corresponding catalog ID with `node scripts/test-status.mjs start ID`,
then use `node scripts/test-status.mjs case ID suite passed` (or `failed`). This
preserves the source fingerprint from before the command. Do not mark a skipped
or unexecuted suite as passed. Regular test invocations outside these recording
paths and historical CI logs are not automatically imported.
The native `release.mjs check` flow captures the same complete frontend, routing
and API suites it already requires; normal diagnostics and failing exit codes
are preserved. Clean Cloudflare Builds therefore publish their own fresh results.

Records stay in ignored `.local/test-status/`. Only allowlisted test names,
statuses, timestamps, durations, revision IDs and source-staleness flags enter
`web/public/test-status.json`; logs, failure payloads, credentials, account
details and test artifacts do not. The read-only page refreshes that snapshot
every 15 seconds. It cannot start commands. A deployed page shows the snapshot
packaged with its build, rather than claiming a live production health check.
`node scripts/test-status.mjs export` saves sanitized, source-matched receipts to
`test-status/receipts.json` for a clean deployment. Local records override those
receipts; both become gray when the corresponding source fingerprint changes.
Web-only Docker builds have no host result records and generate a gray inventory.

The dashboard's model/reporter tests are in `scripts/test-status.test.mjs`. The
Docker form workflow checks expansion, all three colors/counts, proportional
fills, desktop/mobile layout, missing reports and failed refreshes.
