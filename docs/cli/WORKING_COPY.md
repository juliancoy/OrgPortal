# Authenticated production working copies

The [sync everything API](SYNC_EVERYTHING.md) provides a single catalog/pull/
preview/apply endpoint and a client for complete pagination of supported reads.

`orgportal working-copy` exchanges selected records with production through
the authenticated MCP API. It never imports or uploads a database. The local
working directory defaults to `~/.orgportal-working-copy`, outside DR archives,
Wrangler databases and writable fixture volumes. Production remains the authority.

This is an explicit pull/edit/preview/sync workflow, not an unattended full-database
mirror. It supports organization profiles directly and other organization-managed
records through enrolled read/preview/apply workflows. A domain without those
API operations is not covered. Binary attachments, provider state and pagination
require their domain-specific APIs; one enrolled list query copies only its page.
Do not describe this as full private-data replication until coverage is verified.

## Connect and use

```sh
./orgportal auth login --connection working-copy --browser
./orgportal working-copy pull --connection working-copy --organization EXACT_ID
./orgportal working-copy edit --connection working-copy --organization EXACT_ID --file patch.json
./orgportal working-copy preview --connection working-copy --organization EXACT_ID
./orgportal working-copy sync --connection working-copy --organization EXACT_ID --preview-id REVIEWED_UUID
./orgportal working-copy status --connection working-copy --organization EXACT_ID
```

The default patch accepts `name`, `description`, `image_url`, `links`, `city`
and `tags`. Review the returned before/after preview before using its receipt.
Changing a draft invalidates its receipt. Expired or consumed receipts are refused
by production. Live PIdP introspection, exact issuer/resource and subject binding,
scopes, and receiving API membership/role checks apply. No local capability grants
production privileges. Refresh credentials remain in the existing OS keyring.

Production changes after the baseline pull stop outgoing writes. Local drafts
remain available; pull never silently overwrites a pending draft. After dispatch,
a network error records an uncertain attempt and stops retries. Inspect the
operation receipt and production state before forgetting/recreating that copy.
There is no automatic last-writer-wins policy for private records.

## Other organization-managed records

An explicit workflow file selects the existing authorized API operations and
fixed target arguments. For example, portal branding:

```json
{
  "readTool": "get_portal_branding",
  "readArguments": {},
  "previewTool": "preview_portal_branding",
  "applyTool": "apply_portal_branding",
  "writeArguments": {}
}
```

Pass the same `--workflow branding.json` to pull, edit, preview, sync and status.
For record-specific tools, include fixed IDs in both argument objects. An optional
`statusTool` can inspect uncertain writes. Target arguments, organization ID,
confirmation flag and receipt cannot be changed by a draft. Tool discovery must
identify reads as read-only and expose the preview/apply pair; preview tools may
write a temporary receipt. Production validates each schema
and all permissions. The workflow itself is part of the copy's dataset identity.
Use the receiving tool's patch schema. Enrollment does not grant access.

This mechanism can retain private API results, including governance, membership
or event records when an appropriate workflow is enrolled. It does not replicate
identity databases, passwords, sessions or OAuth credentials. Invitations, messages,
financial actions, and other effects retain the receiving API's approval rules;
never automatically replay an uncertain action.

## Retention and deletion

Files are private (directory 0700, records 0600), subject/issuer/resource/org/workflow
bound, and expire seven days after creation. Edits and refreshes do not extend that
clock. Every invocation removes expired copies before reading them. A scheduled
purge is needed to remove expired files while the CLI is idle:

```sh
./orgportal working-copy purge
./orgportal working-copy forget --organization EXACT_ID
```

Neither command requires an active grant. `forget` removes this resource/issuer's
copies for the organization across local accounts and workflows. Expired drafts
are deleted too; these are temporary working copies, not permanent archives.
For an erasure request, remove affected copies immediately with `forget`, review
any manually exported files or independent backups, and reapply verified erasures
before restoring them. The working directory is not added to DR archives by this
feature. Pending drafts therefore have no new off-device backup guarantee.

Source syntax checks alone do not prove end-to-end sync. Authenticated activation,
permission-denial/conflict/retry acceptance, and complete domain coverage remain
separate verification steps. Use isolated synthetic services for authenticated
tests; never enroll dev fixtures in production.
