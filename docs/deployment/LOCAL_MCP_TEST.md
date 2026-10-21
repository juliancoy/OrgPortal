# Local ChatGPT-style MCP connection test

This acceptance test runs actual OrgPortal and PIdP code in an isolated Docker
Compose stack. A local web client simulates ChatGPT's supported dynamic client
registration (DCR) flow with a confidential HTTPS callback, authorization code
and S256 PKCE. It exercises MCP over HTTP after consent. It is independent of
OpenAI and makes no model/API calls. It does not prove that OpenAI's hosted
ChatGPT service can reach this machine, nor test OpenAI-managed certificates,
CIMD registration, provider social login, public DNS or edge configuration.

The client behavior follows [OpenAI's authentication documentation](https://developers.openai.com/plugins/build/auth).
DCR remains supported; this test does not claim to reproduce every ChatGPT
registration option or undocumented request detail.

## Run

Prerequisites: local Docker Engine and Compose v2+, Python 3 with `cryptography`,
Node 22+, OpenSSL, the sibling PIdP source checkout, frontend npm dependencies,
and headless Chromium. For a fresh checkout:

```sh
npm --prefix web ci
cd web && npx playwright install --with-deps chromium
```

From the OrgPortal repository root:

```sh
python3 scripts/run-local-mcp-test.py --pidp-dir ../PIdP
```

Alternatively, `npm --prefix web run test:mcp:local -- --pidp-dir /absolute/path/to/PIdP`.
The test uses installed Google Chrome on Linux when available, then Playwright's
bundled Chromium. Override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

The default gateway is **https://localhost:9446/chatgpt-simulator**. Use `--port`
for a free loopback port. `--start-only` starts the test deployment without running
the browser assertions. The web client offers read, write-scope and separate-browser
connection paths. Use only synthetic local accounts. The runner leaves this
stack available for inspection; it never changes the ordinary local stack.
Do not run this fixed test project concurrently from multiple checkouts.
For repeated acceptance runs, clean up with `--stop` first; the real PIdP
registration rate limits remain enabled and persist in a retained test database.

## What passes

- A cold browser enters the normal portal member sign-in flow. The fixture account
  was registered and email-verified through real local PIdP routes, without injecting
  a browser session, minting a token fixture or mocking an API response.
- The HTTP client discovers protected-resource metadata from the 401 challenge,
  discovers the authorization server, registers a confidential client, and keeps
  its secret and tokens on the simulator server, outside browser page content.
- The browser reviews its actual account and scopes, allows or denies access, and
  returns to a real HTTPS callback. The client validates state and issuer.
- Wrong PKCE and resource exchanges fail; the valid code succeeds once and fails
  on replay. MCP initialization, initialized notification, tool discovery, directory
  search and membership reads execute against the running Worker and local D1.
- Consent creates no organization membership. A read grant receives a missing-scope
  denial; a write-scoped ordinary member receives an operator-permission denial.
  The test checks those exact causes, rather than accepting any tool error.
- Refresh rotates the refresh token. A renewed access token works, then fails
  live introspection immediately after revocation; revoked refresh also fails.
- Desktop and mobile consent are captured, with a mobile overflow assertion.
- Separate browser contexts simulate ChatGPT's connection browser and the user's
  signed-in portal browser. A wrong pairing code fails. The correct code confirms
  identity, while final consent remains in the initiating browser.

The test records the discovered tool count for diagnosis, without asserting a
fixed count. Browser interception only blocks off-origin traffic; it fulfills no
API, login, consent, metadata or MCP response. Browser request helpers handle
fixture registration and the local verification mailbox, not account sign-in.

## Isolation and cleanup

The Compose project is `orgportal-mcp-e2e`. It has its own PostgreSQL and D1 volumes,
signing keys, introspection secret and self-signed localhost certificate. The
runner uses a local Docker socket, binds only `127.0.0.1`, disables replication
and email sending, and uses an isolated Worker config with a synthetic database
ID and no production services, queues or bindings. No production `.dev.vars` or
PIdP environment file is loaded. PIdP source is mounted read-only. This tests the
normal namespace/permission checks; it does not weaken them.

Services share the gateway's network namespace so the exact HTTPS localhost
issuer is reachable both from containers and the host. The Worker uses HTTPS
behind nginx, avoiding development-proxy URL rewriting to HTTP. Server-side
requests trust the fixture certificate explicitly; browser certificate exceptions
are confined to this local test. Only the registered local portal's immutable
website namespace and the primary account namespace are trusted. The normal local
registration helper provisions its reserved administrator; acceptance signs in
as a separately registered ordinary portal member.

Ignored `.local/mcp-e2e/` holds generated configuration and fixture secrets with
restricted permissions. `results/summary.json` contains outcomes without tokens;
PNG files show synthetic account UI. Browser contexts are ephemeral, no storage
state is exported, and the simulator keeps pending OAuth state only in memory
for ten minutes. Tokens are revoked after successful connection checks. PIdP
account/client/grant records and Docker verification logs remain local until
cleanup; no backups, replicas or provider mail copies are created by this stack.

After inspection, remove the dedicated containers, synthetic data, test volumes,
logs, keys and screenshots:

```sh
python3 scripts/run-local-mcp-test.py --stop
```

The command uses only the named test project and its own state directory. Do not
archive the generated secret/config files or upload raw Docker identity logs.

This full integration test requires both application checkouts and local Docker;
it is a separate acceptance command, not the mocked browser suite in ordinary
frontend CI. Run it after changing OAuth routing, login/handoff, MCP auth,
resource discovery or the local test harness. No production deployment or schema
migration is performed; migrations apply only to the disposable local fixture DB.
