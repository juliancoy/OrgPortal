# Browser recovery coverage

Coverage is implemented but has not been executed under the user's instruction not to run tests or deploy.

## Desktop and mobile browser suite

`web/tests/e2e/mcp-login.spec.ts` uses controlled API/network fixtures through the standard Playwright projects (desktop Chromium and Pixel 7). It now checks:

- A disconnected metadata read offers an explicit retry, performs no confirmation while offline, and confirms once after recovery.
- A temporary 503 keeps confirmation inert until explicit retry.
- A lost confirmation response offers no replay button; a different connection request can proceed.
- A request that expires between metadata and confirmation cannot become a grant or offer a same-request retry.
- An inactive browser session signs in again while retaining the pending MCP request, then resumes the review.

Existing cases cover return-path retention, issuer validation, expiry before handoff and expired browser-session recovery guidance. These fixture tests exercise the real portal recovery UI, not Google or a real OAuth authority.

## Full isolated Docker flow

`web/scripts/test-local-mcp.mjs`, provisioned by `scripts/run-local-mcp-test.py`, adds real-authority recovery scenarios:

| Scenario | Required evidence |
| --- | --- |
| Wrong remembered account | Switch accounts in real consent UI; no grant before approval; the MCP canonical account matches the newly selected synthetic account. |
| Expired consent | Expire only the fixture's consent record; submission returns 400 with browser recovery guidance and creates no grant; a new connection succeeds. |
| Lost connection before handoff | Abort one metadata request, explicitly retry, and complete real OAuth/MCP calls. |
| Lost confirmation response | Process one real handoff and discard its response; never replay it; recover through a new client connection. |
| Reconnect after revocation | The simulator proves the prior tokens fail after revocation, then a fresh browser consent creates exactly one new working grant. |

Only transport faults are injected. Local OAuth responses, credentials, tokens and MCP results are real, using synthetic accounts and the isolated fixture database. Expiry targets the hash of one synthetic consent nonce; no blanket cleanup or production mutations. The dedicated stack must remain localhost-only, use its own volumes/database, disable outbound email and block external browser requests. No nonce, token, client secret or account identifier is included in recovery result summaries.

The simulator calls `get_current_account` through MCP to verify account switching. Its optional expectedAccount input accepts only synthetic example.com addresses. Existing tests still exercise PKCE/resource mismatch, code replay, refresh rotation and live revocation for each completed connection. Summary JSON records explicit recovery scenario names only after assertions complete.

The full Docker flow is not currently executed by GitHub CI; its syntax check alone is not a passing recovery run. The Playwright fixture suite is configured in the existing browser CI job. Real Google login and actual ChatGPT-client acceptance remain separate provider/client checks.

## Recovery behavior

Only a pre-confirmation read failure is marked retryable. Lost or failed one-use POST responses require starting a new connection. Expired permissions forms return a browser-readable 400 page in both PIdP runtimes; API clients still receive the OAuth error response. No recovery path grants access or reuses an expired consent silently.
