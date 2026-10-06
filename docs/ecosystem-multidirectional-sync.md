# Multidirectional ecosystem synchronization

Requested scope: ecosystem organizations, events and funding evidence across browser IndexedDB, independent local SQLite deployments and D1 deployments. Identity, credentials, roles and permissions are outside the replicated domain. Writable offline data cannot replace authorization at the receiving server.

## Implemented and tested building blocks

- `shared/ecosystemSync.ts`: validated immutable changes, stable IDs, Lamport counters, deterministic concurrent-write ordering and retained deletion markers. All peers merge the same approved changes to the same state regardless of delivery order. Whole-record concurrent edits resolve by `(counter, replicaId, changeId)`; this is not field-level merging. History retains the losing changes for review.
- `web/src/data/ecosystemSync/store.ts`: a separate IndexedDB change log and durable outbound queue. An offline edit persists atomically with its queue entry. Failed transport or malformed acknowledgements do not clear pending changes. Received changes and acknowledgement removal commit in one IndexedDB transaction.
- `org-worker/migrations/0068_ecosystem_sync.sql` and `src/ecosystemSyncStore.ts`: durable SQLite/D1 change log, pending queue and paginated accepted-change feed. Conflicting change-ID reuse aborts the entire batch. Pending local edits are not published as accepted data. The migration has only been exercised in isolated test databases.

These primitives are **not integrated into the application or deployed**. The existing organization replication remains primary-to-read-replica. Browser reports remain public read caches. No current deployment should be described as multi-primary or convergent for offline writes yet.

## Required integration before activation

1. Add receiving API validation for the existing public organization/event/support schemas. Authenticate the user, enforce live organization permissions, and retain required preview/apply receipts. Peers need explicit enrollment and restricted credentials; neither a local login nor a public feed credential grants production write access.
2. Atomically project accepted changes into the existing domain tables and audit trail, so the master transaction view and map show the same records. Capture existing API writes into the durable change log. Bootstrap existing records with stable identities; match sourced evidence instead of duplicating organizations or payments.
3. Wire IndexedDB transport and local/D1 pollers to exchange only accepted changes, reconcile cursors after crashes, retain failed/outgoing changes, and display pending/conflict status. Existing snapshot prune logic must never erase an offline queue. Registered peers must share a dataset identity and reject data from unrelated tenants/datasets.
4. Prove browser → SQLite → D1 → browser convergence, offline concurrent edits, deletions, duplicate delivery, permission revocation, expired receipts, corrupted batches and recovery from backups on isolated writable fixtures. Never enroll authentication/session-test fixtures into production.
5. Deploy and enroll the real workers, then verify their health and observed lag. An account inventory currently contains one organization D1 database (`org`); chat and PIdP databases belong to separate services and are not ecosystem replicas.

## Backups

CodeCollective owns the installed daily backup timer and script in `cloudflare/backups/` and `scripts/backup-ecosystem.py`. Production SQL restore and private off-device R2 upload have been verified. Local SQLite copies use the online backup API. The timer is host-dependent; an always-on cloud export workflow remains separate work. Browser-only pending edits are not included in production backups until accepted; IndexedDB backup/export and deployment enrollment still need integration.
