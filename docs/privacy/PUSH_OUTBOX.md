# Push delivery recovery and lifecycle

`push_outbox` stores the complete push job before queue submission. Its event and
recipient hash is stable across retries. Queue delivery claims a renewable lease;
successful delivery or suppression clears the payload and recipient identifiers.
Provider calls have a ten-second timeout. Existing delivery receipts deduplicate
already-sent subscriptions after a retry or recovery replay.

Pending payloads expire after 23 hours; the minute retention task clears at most
500 expired payloads per pass. Opaque hashes expire after seven days. No credentials,
provider errors, or payloads are logged. The store is excluded from public replicas
and immutable business journals and included in full D1 DR exports. A restored
service remains isolated until deletions, expiry, consent and delivery state have
been reviewed; only then resume its ordinary dispatcher. It can reconstruct queue
work from unexpired rows without importing transport queue contents.

Account erasure must clear rows matching `user_id` and rows for subscriptions
belonging to that account, alongside `push_subscriptions` and `push_deliveries`.
Remove the rows rather than retaining payloads in audit records. Review the same
identifiers in local dev copies and retained DR generations, and reapply confirmed
deletions before any restoration serves traffic. Minimal completed hashes contain
no recipient or message content, but remain private operational metadata.

Schema migration: `0124_push_outbox.sql`. Automated cleanup and retry implementation
is in `pushOutbox.ts` and the existing scheduled Worker; production installation
must be confirmed in its deployment and backup coverage receipts.
