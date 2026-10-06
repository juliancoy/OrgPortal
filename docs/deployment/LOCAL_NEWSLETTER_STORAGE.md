# Writable local newsletters

`python run.py bmoremedtech- bmoremedtech` retains public organization replication
and enables a separate writable newsletter domain. `ORGPORTAL_LOCAL_NEWSLETTER_WRITES=0`
disables it. Real newsletter imports are allowed here at the user's explicit
request; they are not isolated browser-test fixtures or production edits.

The server runs the same D1 SQL migration contract on local Wrangler SQLite.
Migration 0070 preserves existing change sequences, pending entries and immutable
revision history. IndexedDB version 2 upgrades its existing stores without clearing
offline edits and partitions newsletter stores by the deployment's persistent UUID.
The protocol/version contract lives in `shared/newsletterStorage.ts` and
`docs/deployment/storage-contract.json`.
Migration 0071 archives complete original Gmail MIME trees in the same transaction
as their issue revision. Full newsletter text and links travel into IndexedDB;
original transport headers, HTML and MIME metadata remain in the private server
archive. Live source archives and mail data are never checked into Git.

## Import and offline use

The runner saves the deployment UUID and capability in the mode-0600 file
`.local/<prefix>newsletter-storage.json`. Local bindings are saved in ignored
`.local/<prefix>newsletter.dev.vars`, mounted at `/app/.dev.vars` for that worker.
Different local stacks never replace each other's dataset or credentials.
Secrets never belong in Git and are never uploaded by
Wrangler deployment. Reusing the prefix preserves the dataset and credential.
Use separate checkouts/config files for independent datasets.

Import the captured newsletter with:

```sh
python3 scripts/import-local-newsletters.py ../.local-imports/biobuzz/2026-09-18.json \
  --receipt .local/biobuzz-import-receipts.jsonl
```

The CLI verifies the local TLS certificate and dataset, previews the exact
document, then commits through a ten-minute receipt. Whole issue content and item
types are retained, including news, financing headlines, personnel, hiring and
calendar information. An identical content hash is idempotent; a correction is
a new immutable revision of the same issue. Reported financial headlines are
archived as reported claims, not automatically booked as settled money or verified
financing totals. Gmail access is still required to collect inbox issues.

Open `/local/newsletters`, enter the local deployment capability, and connect.
The credential stays in page memory, never in IndexedDB. File imports save their
revision and outbox atomically, work offline after the initial connection, and
sync only to the chosen local dataset. Accepted server changes are replayed
idempotently. The local API accepts newsletter changes only; it does not grant
membership, production permissions, or mutations of replicated organizations.

Concurrent edits converge by `(counter, replicaId, changeId)` with all losing
revisions retained. This resolves complete issue documents, not individual fields.
Deletion tombstones prevent stale replay from resurrecting deleted records.
Upstream organization snapshots never touch the newsletter archive, sync log or
pending browser queue. There is no automatic publication to cloud D1.

## Version control and recovery

Run `python3 scripts/snapshot-storage-deployment.py` to save a content-addressed
source archive and manifest under `.local/deployments/`. The manifest records Git
HEAD, pending merge parents, dirty state, per-file hashes, every migration hash,
protocol and IndexedDB versions. It describes the actual source tree even when a
commit hook prevents finalizing a commit. Source changes and migrations belong
in Git; live database files, credentials and mail archives do not.

The existing CodeCollective backup tooling copies local SQLite databases using
the online backup API. These copies include import receipts and the immutable
newsletter log. `python3 scripts/backup-local-storage.py` takes a local-only
online backup and checks integrity, counts and SHA-256 hashes. The browser's **Export backup** includes its dataset, local
replica ID, full change history and unacknowledged outbox. Keep browser exports
private because they contain mail content. Restore by replaying newsletter
changes into the same dataset with `/api/local/newsletters/sync`; validate the
dataset before replay. Do not roll a SQL schema backward in place: restore a
consistent backup into a separate deployment and preserve the outgoing queue.

The cloud D1 migration and receiving code are versioned and exercised against the
D1-compatible SQLite adapter, but enabling remote writes requires a separately
authorized authenticated publication deployment. Do not place local capability
secrets into the public Worker configuration.
