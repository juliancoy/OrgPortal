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
defaults to `https://id.codecollective.us`. The CLI prints a sign-in link and does
not open a browser by default. Paste the link into the browser profile with your
chosen Google account. Use `--browser` to opt into opening the default browser.
`--client-id` selects an already registered
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
D1-backed OrgPortal services. Each update still needs a supported remote operation,
live account permissions, and its preview/apply receipt where required. The local
newsletter capability is separate from this account login. Authentication alone
does not turn the local replica into an authorized source of production edits.

## Private newsletter synchronization

```sh
orgportal auth login
orgportal sync --dry-run
orgportal sync
```

Sync transfers only newsletter history, tombstones, and original Gmail MIME trees.
It keeps existing remote history and pulls remote edits back to local SQLite.
The browser receives these edits through its normal local IndexedDB sync.
It never replaces the remote database or uploads organization/identity replicas.

The default local origin is `https://localhost:8443`. `--local`, `--deployment`
and `--cert` select another local deployment's HTTPS loopback origin, private
newsletter capability JSON and pinned certificate. TLS verification stays enabled.
An existing saved account login is required; sync never starts an interactive login.

Remote `/api/newsletters/status`, `/changes`, `/archives/:hash`, `/preview`
and `/apply` routes authenticate the account against PIdP, check live revocation,
and require portal read/write scopes. Each account can access only its own archive
within the OAuth resource. Originals and full issues are never exposed by the public
replication API. Preview receipts bind the account, resource and exact batch hash;
applying commits the receipt, immutable history and originals in one transaction.
The CLI checks the returned preview before applying the user-requested sync.

Each request carries at most one full issue/original and is bounded to 1 MiB.
The API enforces 60 write requests per account per minute; the CLI resumes on the
next minute when limited. Re-run sync after an interrupted transfer: duplicate
change IDs are idempotent, and conflicting IDs abort the transaction. `--dry-run`
only reads history and prints the change counts. Final receipts are stored under
`.local/newsletter-sync-receipts/` with private permissions.

Release migration `0072_private_newsletter_sync.sql` and the org Worker through
CodeCollective. Preserve existing OAuth resources and introspection secrets.

Credentials are reusable through `credentialStore` and `browserLogin` in
`org-worker/scripts`: call `accessToken()` immediately before authenticated
requests, and release the store lock after the operation. Refresh rotation and
ambiguous-request protection are handled by the existing connection implementation.
