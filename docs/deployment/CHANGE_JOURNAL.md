# Transactional change journal

Migration `0073_change_journal.sql` adds an append-only journal in primary D1.
SQLite triggers record INSERT, changed UPDATE, and DELETE for 89 business tables,
including direct SQL edits and cascade effects. Before/after rows and primary keys
are stored as JSON. A rolled-back business mutation leaves no journal entry.
No-op updates produce no entry. This records committed row changes; it does not
invent an actor or transaction grouping for SQL writes that provide neither.

The primary journal is its durable outbox. The existing minute cron copies at most
100 entries per run into the separate `org-journal` D1 database. Each page's entries
and checkpoint commit atomically. Retried entries are inert; conflicting content
at an existing source/sequence aborts the page. Checkpoints cannot move backwards.
Failures leave the primary log intact, and the next run resumes delivery.

The secondary database is an independent journal, not a full application replica.
Use the application's snapshots/backups with the journal when investigating or
restoring state. Capture starts when migration 0073 is applied; earlier changes
are not reconstructed. Financial and domain edits remain subject to their existing
account permissions. Neither journal has a public HTTP endpoint.

Credential columns are replaced by `[REDACTED]`. `change_journal_coverage` lists
captured columns and redactions; `change_journal_exclusions` lists 12 transient
authentication, rate-limit, receipt and delivery/scheduler tables. Infrastructure
tables owned by SQLite/Cloudflare are not covered. Complete credential recovery
requires protected backups, not this redacted journal. Private newsletter contents
and other personal data stay in these private databases, accessible only to the
Cloudflare infrastructure operator. No browser or account API exposes them.

Local public snapshot refreshes do not generate business journal traffic.
Local newsletter history and originals still generate journal entries. The remote
copier is disabled on organization replicas, preventing local data from entering
the production backup journal. Future table/column migrations must extend or
explicitly exclude their journal triggers; schema-coverage tests detect gaps.
Never rewrite an applied migration. The generator reproduces the initial 0073
trigger definitions from migrations through 0072.

## Local WAL mirror

`run.py` enables a user-level systemd timer by default. It mirrors the remote
journal every minute, starts again with your user session, and retries failures
on the next run. An already-running sync is never overlapped. No Docker credential
mount or additional container is needed.

For setup without restarting the portal:

```sh
python3 scripts/setup-journal-sync.py
```

Install Node.js 22.13+ and `npm ci` in `org-worker` first. The timer uses your
existing Cloudflare operator login; it never opens a browser. If authentication
expires, refresh that login manually and the next run resumes automatically.
It runs while your user session is active and catches up after downtime.
Check `systemctl --user status orgportal-journal-sync.timer` and
`journalctl --user -u orgportal-journal-sync.service` for status and errors.
To disable it, run `systemctl --user disable --now orgportal-journal-sync.timer`
and set `ORGPORTAL_JOURNAL_AUTO_SYNC=0` for subsequent portal starts. Hosts without
user systemd can use the same one-shot command below in their existing scheduler.

Manual sync remains available:

```sh
orgportal journal sync
orgportal journal sync --file /private/path/change-journal.sqlite
```

This administrative command uses the existing Wrangler/Cloudflare operator login,
not a PIdP website account. It only reads the cloud journal. The dedicated local
SQLite file uses WAL with `synchronous=FULL`; entries and checkpoints commit in
one transaction. The default file is `.local/journal/change-journal.sqlite`, mode
0600 in a private directory. Closing/reopening or repeating the command preserves
the checkpoint and does not duplicate entries. Back up the live file using
SQLite's backup API; do not copy only its main file while WAL writes are active.

## Release and recovery

CodeCollective's org release applies the secondary `journal-migrations` first,
then primary migrations, and preserves the `JOURNAL_DB` binding. Both schemas and
the binding ID are versioned. No additional cloud Worker or queue is required.
Cloudflare manages D1's physical journaling; the local mirror uses
SQLite WAL. The logical journal remains after WAL checkpoints.

Compare the primary journal's maximum sequence with `org-journal`'s matching
`journal_checkpoints.sequence` to measure lag. Scheduled replication failures are
visible in Worker logs. Recovery after an ordinary failure is the next scheduled
run or the next local mirror invocation.

If the primary D1 is restored to an earlier point in time, replication rejects a
rewound head or a conflicting sequence. Preserve the secondary history. After
reviewing the restore, create a new generation with:

```sql
UPDATE change_journal_source SET source_id=lower(hex(randomblob(16))) WHERE id=1;
```

The next run copies the restored journal under its new generation; the old
generation remains in the secondary and local mirrors. Do not delete journal
history or rewind checkpoints to make a restore appear seamless.
