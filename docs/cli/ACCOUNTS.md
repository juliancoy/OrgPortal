# OrgPortal account connections

OrgPortal CLI 1.3 uses the same authenticated MCP tools as hosted clients.
From this checkout, use Node.js 22 or newer, install the lockfile dependencies
with `npm --prefix org-worker ci`, then run `./orgportal --help`.

```sh
./orgportal --version
./orgportal auth login --connection personal --browser
./orgportal auth login --connection work --browser
./orgportal auth list
./orgportal auth switch work
./orgportal whoami
./orgportal auth status
./orgportal auth status --live --json
./orgportal doctor --json
```

The default resource remains LifeTech at `https://lifetech.fyi/api/org/mcp`.
Use `--portal https://orgportal.cc` for `https://orgportal.cc/mcp`, or select an
exact `--resource` with its matching `--issuer`. Connections and selections are
isolated by the exact resource and issuer; choosing an account never transfers
credentials or membership between tenants. An explicit `--connection` or
`ORGPORTAL_CONNECTION` overrides the saved selection for that invocation.

`auth list` inspects locally registered connection names and keyring status,
without a network call. `auth status` reports saved state, not proof that a grant
is still valid. `auth status --live` verifies it against the MCP server.
Explicit `auth login` always opens a fresh PIdP account-selection flow, even when
the named connection has saved credentials. Cancelled sign-in preserves them.
Use `auth switch NAME` after login to select that connection. The browser profile
does not prove which PIdP account is selected.

`whoami` returns the PIdP account email and its verification status when supplied,
the verified subject, canonical user ID, granted scopes,
expiry, server version and current memberships. IDs identify the account;
organization access is checked separately. Tenant resources expose only that
tenant's memberships, with at most 500 rows and an explicit truncation flag.

`auth switch NAME` verifies an existing saved account before changing the local
selection. It does not sign out or revoke the previously selected account.
`auth logout` revokes only the selected grant, then removes its local name and
selection; a failed revocation retains the saved grant for recovery.

Refresh credentials stay in the existing OS keyring. Only connection labels,
resource and issuer URLs, and local selections are stored in the private
`~/.orgportal-connections/connections.json` file. No account profiles, access
tokens, refresh tokens or client credentials belong in that file. Logout removes
the corresponding metadata. Older uploader connections remain usable with an
explicit `--connection NAME`; successfully selecting one registers its name for
future listing. Unknown historical names cannot be recovered from hashed keyring
keys. The existing default credential key remains unchanged.

Account inspection commands support `--json`; failures use a nonzero exit code.
`doctor` checks public resource/issuer discovery, saved credential availability,
authenticated MCP access, live revocation validation and the organization database.
It does not start sign-in or change organization data. OAuth refresh may rotate a
saved refresh credential through the existing protected keyring flow. Warnings or
failed checks produce exit code 1; successful checks produce exit code 0.

## Hosted MCP clients

The same server exposes three read-only tools requiring `org:portal.read`:

| Tool | Purpose |
| --- | --- |
| `get_current_account` | Verified account and current organization memberships. |
| `get_connection_status` | Current grant scopes, expiry, tenant boundary and server identity. |
| `diagnose_connection` | Authentication, revocation and database checks with actionable results. |

Every new tool declares input/output schemas and returns structured content.
Diagnostics never include credentials, internal bindings or raw backend errors.
Errors include a stable code and retryability. Account information is computed
per authenticated request and is never persisted as a separate profile store.

Hosted connection names and account selection belong to the MCP client. Select
or add an account there, and use PIdP's account chooser when connecting. OrgPortal
cannot enumerate another client's saved grants or change its selected connection.
Refresh the client's tool list after upgrading the server.

## Verification

From `org-worker`:

```sh
node --import tsx --test test/mcp-account-tools.test.ts test/cli-account-tools.test.ts test/orgportal-cli.test.ts test/upload-connection.test.ts test/mcp-resources.test.ts
npm run typecheck
```

These tests include real SDK client/server calls, scope denial, revoked grants,
canonical identity mapping, tenant isolation, keyring lifecycle, private metadata,
failed selection and sanitized diagnostics. Authenticated production browser tests
are excluded; test credentials and accounts remain local fixtures.

Email is read live from PIdP for the authenticated subject with `org:portal.read`.
Missing verification is reported as unknown. It is never used to link identities
or grant organization access, and is not persisted in CLI connection metadata.
