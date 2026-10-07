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
1.0.1 package, preserving its name and publisher metadata, versioned 1.1.0.
The existing private installation remains available for development.
Portable mcp.json is required for submission; do not add private app bindings.
Importing a ZIP does not publish a public directory listing.

Five positive and three negative cases are embedded in plugin.json. They are
**not run in ChatGPT**. The icon is the existing mark rendered as a 512px PNG.

## Publication blockers

The source is NOT submission-ready. Complete these items before final packaging:

1. Confirm the verified publisher identity (existing package: Julian Loiacono),
   supported countries, and whether users make purchases or payments.
2. Confirm the public support destination and published privacy/terms covering
   actual integration data use, sharing, retention and deletion. Existing `/terms`
   requires review; unverified listing URL fields are intentionally omitted.
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
