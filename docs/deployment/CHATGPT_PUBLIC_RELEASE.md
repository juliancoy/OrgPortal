# OrgPortal public ChatGPT release

## Implemented source

- Canonical endpoint: `https://orgportal.cc/api/org/mcp`.
- PIdP owns OAuth. Live discovery advertises DCR and S256 PKCE. DCR provides
  automatic registration; CIMD is not implemented or advertised by this release.
- The companion PIdP change permits any nonempty subset of allowed scopes at
  registration and authorization, including organization-only access. Callback
  checks, PKCE, consent, resource binding and revocation remain enforced.
- Tools advertise their OAuth scopes and boolean safety annotations. OrgPortal
  continues to enforce live organization permissions and preview/apply receipts.
- The homepage adds Install → Sign in → Ask. Until publication, the CTA explains
  that public installation is unavailable. It does not distribute the private ZIP.
- After publication, set `VITE_ORGPORTAL_CHATGPT_LISTING_URL` to the actual
  chatgpt.com listing URL when rebuilding through CodeCollective.
- Initialization and PIdP consent display OrgPortal branding.
- With existing Cloudflare observability, `orgportal.mcp.request` logs report
  method category, HTTP status, duration and outcome, including tool errors in
  HTTP 200 responses. Pre-parser failures are `unparsed`. No tokens, identities,
  arguments, results, URLs or error messages are logged. Aggregate by method,
  outcome and status for error rates and latency; establish alert thresholds from
  actual traffic. Separate 401/403, 429 and 5xx when diagnosing onboarding.

## Public package

`plugins/orgportal` is a separate public-upload source based on the owned private
1.0.1 package, preserving its plugin name, versioned 1.1.0. The publisher has confirmed the
public identity Julian Coy, all supported countries, and that OrgPortal is
currently free and open-source software (FOSS). Country restrictions are explicitly
removed with publication.countries = []. Identity verification remains pending.
The existing private installation remains available for development.
Portable mcp.json is required for submission; do not add private app bindings.
Importing a ZIP does not publish a public directory listing.

Five positive and three negative cases are embedded in plugin.json. They are
**not run in ChatGPT**. The icon is the existing mark rendered as a 512px PNG.

## Publication blockers

The source is NOT submission-ready. Complete these items before final packaging:

1. Verify the selected publisher identity Julian Coy in the portal. FOSS and no
   current in-app purchases are confirmed. Support and privacy contact:
   julian@codecollective.us. See ../privacy/RETENTION_AND_DELETION.md for policy
   and ../privacy/OPERATIONS.md for enforcement gaps and operator procedures.
2. Deploy OrgPortal commit c468c40 (or a descendant) and verify the new public
   `/api/org/support`, `/api/org/privacy`, and `/api/org/terms` pages. These URLs
   are populated in the package but are NOT verified live yet.
3. Create a dedicated reviewer account with a sample organization, native event
   and motion. Keep credentials in secure submission fields, never in the ZIP.
4. Run the cases in ChatGPT against the deployed version. Record connect/consent,
   organization listing, event listing/details, an edit preview, explicit approval,
   verified edit, and the unsupported bank-transfer boundary. Keep secrets and
   unrelated data offscreen. Host and verify the real recording, then populate
   review.demo_recording_url. This walkthrough is not a recorded demo.
5. Complete developer/domain verification and legal attestations as the publisher.
   Validate and inspect a ZIP containing only the orgportal package directory.
   Upload the draft, connect and test its saved version, then submit for review.
   Publication is a separate step after approval.

## Deployment

Release PIdP separately; deploy the shared OrgPortal backend and rebuild the
frontend through CodeCollective with ORGPORTAL_DIR pointing at the intended
checkout. No database migration or secret replacement is needed.

Deployed through the connected Cloudflare API on October 7, 2026:

| Service | Active Worker version | Source commit |
| --- | --- | --- |
| PIdP | `0290ef7a-de7a-432f-9096-76d9cd117b79` | `f2206c81ac6c982acbc1a8db3279239b8d1296ad` |
| OrgPortal backend | `5b3e4876-2f11-481e-a54c-b033fbaa2111` | `416b1df634b130157476c758d1ac9f8e17b43ad5` |
| Shared frontend | `a549b261-b47b-4450-977d-b28a4902b747` | CodeCollective `ab1348558ec9f8d8e93d74b6bf7bd25f6d42177d`, OrgPortal `416b1df` |

All three versions serve 100% of traffic. Existing production bindings and
secrets were retained; PIdP retains its 1000ms CPU limit. No migrations ran.
The shared frontend was built through CodeCollective and its assets uploaded
using Cloudflare's asset-upload session, with run_worker_first retained.

Verified live: all three frontend origins return HTTP 200; the homepage's JS/CSS
and OrgPortal logo load; the served JS contains the new onboarding copy; both
backend version endpoints report the expected clean commits; OAuth discovery
advertises DCR and S256; the protected resource is the canonical OrgPortal URL;
an unauthenticated initialize returns 401 with the correct resource metadata
challenge; its safe failure telemetry appears in Cloudflare logs. The 27 shared
frontend routing tests pass, in addition to prior backend/OAuth tests and builds.

Real-account ChatGPT linking and authenticated read/preview/apply remain unverified.
Repository rules limit production browser checks to anonymous reads; authenticated
regression fixtures remain local. This deployment is not public directory approval.

## Laptop handoff — October 7, 2026, 17:48 America/New_York

All implementation source is committed and pushed:

- OrgPortal: `c468c40c49e3e2245f14b8eab254de3940c633d4`.
- PIdP: `6928287855a9c2003ed6abb4b6d35dc5d95e9730`.
- Publisher: Julian Coy; all supported countries; currently FOSS, no in-app
  purchases. Support/privacy: julian@codecollective.us.

### Actual production state

PIdP retention is deployed: active version
`6457a389-7648-44f8-8c74-c88ee9dee1e9`, source `6928287`.
The settings update generated this version after the initial retention version
`f349a6ba-0035-4835-91ef-0f0a16b76a4c`. Its cron is `*/5 * * * *`.
Expired MCP codes went from two eligible rows before deployment to zero in the
read-only production verification. Query-string redaction is enabled.

OrgPortal is still serving the previous implementation, source `416b1df`.
Its active version is `f8735a49-2d3d-4e4d-8cc8-0b85f68b489f`, created by the
query-redaction settings update, with its existing minute cron. The new OrgPortal
bundle upload was interrupted and no new source version was visible in the
subsequent inventory. Do not infer deployment from the source commit or settings
version: cleanup and public policy routes from `c468c40` are NOT live yet.
No account/content purge or schema migration ran.

### Review and validation

- OrgPortal typecheck, seven targeted MCP/retention tests, and Wrangler dry-run
  passed; typecheck and seven tests were repeated from a fresh checkout.
- PIdP typecheck, 19 Worker OAuth/retention tests, Python retention test and 18
  Python OAuth tests passed during implementation; Wrangler dry-run passed.
- Cleanup uses bounded batches, correct per-table timestamp units, dry-run counts
  and safe aggregate logs. Live rows, unresolved event operations and refresh
  replay evidence are preserved. No deletion triggers archive temporary secrets.
- Full account erasure, shared-content decisions, support-mail retention and
  backup/export reconciliation remain operator-managed. Do not describe this as
  full automated enforcement of every retention-policy category.

### Resume on the laptop

1. Pull main in OrgPortal and sibling PIdP. Preserve any laptop changes while
   updating; do not reset them to these commits blindly.
2. Deploy the OrgPortal backend through the existing CodeCollective shared-release
   procedure, using OrgPortal `c468c40` or later. Build metadata now also generates
   the public policy pages. Preserve bindings, secrets and existing cron.
3. Verify `https://orgportal.cc/api/org/version`, the three policy URLs above,
   and `orgportal.retention` cron logs. Confirm eligible temporary records drain
   without backlog. Avoid a second PIdP deployment unless its source changes.
4. Finish the manual retention inventory and provider backup verification in
   `docs/privacy/OPERATIONS.md`; keep real requests/evidence outside this repo.
5. Rehearse and record a real ChatGPT demo using a dedicated reviewer account and
   sample organization/event/motion: connect/consent, list organizations, read an
   event, preview a description edit, explicitly approve it, verify the saved
   result, and demonstrate that bank transfers are unsupported. Do not record
   credentials or unrelated private data. Host the video with reviewer access and
   add its verified URL to `review.demo_recording_url`.
6. Build and inspect a ZIP of `plugins/orgportal`. No final submission ZIP or
   portal draft was created in this session. Complete developer verification,
   secure reviewer access, saved-version connection/tests, and publisher legal
   attestations; then submit. Public review submission has NOT occurred.

The automated upload calls stalled twice; Cloudflare read-only inventory was
checked after interruption. Inspect current versions again before retrying.
