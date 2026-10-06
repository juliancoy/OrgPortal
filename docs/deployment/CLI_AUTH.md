# OrgPortal CLI account login

Install dependencies with `npm ci` in `org-worker`. Add the repository's
`scripts` directory to PATH, or symlink `scripts/orgportal` into your personal
bin directory. The launcher resolves its symlink back to this checkout.

```sh
orgportal auth login
orgportal auth logout
orgportal auth login --portal https://medtech.social --connection medtech
orgportal auth logout --portal https://medtech.social --connection medtech
```

The default portal is `https://lifetech.fyi`. `ORGPORTAL_PORTAL`,
`ORGPORTAL_ISSUER`, and `ORGPORTAL_CONNECTION` set defaults. `--resource`
selects an explicit HTTPS MCP endpoint instead of `--portal`. `--issuer`
defaults to `https://id.codecollective.us`. Use `--no-browser` to open the
printed sign-in link yourself. `--client-id` selects an already registered
public native client when dynamic client registration is disabled.

Login delegates account sign-in and explicit consent to PIdP, using S256 PKCE
and a temporary literal loopback callback. It requests event and portal read/write
scopes. Refresh credentials stay in the OS keyring, isolated by issuer, exact
resource and connection name. Existing event-upload CLI connections use this same
store; no passwords or tokens are written to source files or printed.
Repeated login reuses and verifies the existing saved connection. To switch
accounts, log out first and log in again. Logout revokes the refresh grant before
clearing its local credential; a failed revocation retains the credential for retry.
The OS keyring must be available and unlocked; there is no plaintext fallback.

These commands establish the account credentials for API/MCP updates to remote
D1-backed OrgPortal services. They do not execute SQL, publish newsletter data,
or synchronize local changes. Each update still needs a supported remote operation,
live account permissions, and its preview/apply receipt where required. The local
newsletter capability is separate from this account login. Authentication alone
does not turn the local replica into an authorized source of production edits.

Credentials are reusable through `credentialStore` and `browserLogin` in
`org-worker/scripts`: call `accessToken()` immediately before authenticated
requests, and release the store lock after the operation. Refresh rotation and
ambiguous-request protection are handled by the existing connection implementation.
