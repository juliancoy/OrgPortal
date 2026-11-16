# Presentation host email rollout — November 16, 2026

Requested behavior: each new presentation application emails the event host
organization's active owners and organizers. Includes signed-in browser/MCP and
guest applications. Edits, retries, previews and rejected submissions do not send
new alerts. Provider-calendar hosts without OrgPortal management rights are not
recipients of private application details.

## Explicit schema review

Migration `0135_presentation_host_notifications.sql` is additive: one private
outbox, two indexes, two enqueue triggers, two deletion triggers and one journal
exclusion. It neither rewrites existing applications nor queues historic mail.
Each insert and its host alerts commit or roll back together. Unique keys prevent
duplicate alerts for a submission/host. Existing API versions remain compatible:
they can enqueue while the new dispatcher is absent. New code tolerates a missing
outbox so migration and API release can occur separately. A code rollback retains
queued mail; it does not undo the migration or replay accepted messages.

Privacy review: addresses and proposal bodies are resolved at dispatch, not stored
again. Live authority is checked before sending. Revocation/host reassignment,
withdrawal and expiry suppress delivery. The proposal expiry and deletion paths
also govern its outbox; account erasure and backup restoration are documented in
the privacy operations runbook. No public snapshot or journal payload is added.

Validation: 20 existing presentation tests and one retention test passed. Eight
new host-email tests passed, including concurrent dispatch, MCP preview/apply,
guest acknowledgement failure, access revocation, event reassignment, retry and
uncertain outcomes, missing-address recovery, replicas, atomicity and cleanup.
API TypeScript passed. Commands, source fingerprints and failed fixture correction
are retained in `org-worker/test/presentation-host-notifications.test-log.jsonl`.
Mail tests use local SQLite and an in-memory transport; no test emails are sent.

## Production preparation

Verified Email Sending enabled for `lifetech.fyi` and `notify.orgportal.cc`.
Live `org-codecollective` `SUPPORT_EMAIL` permits `service@lifetech.fyi` and
`admin@lifetech.fyi`. LifeTech uses `admin@lifetech.fyi`; generic organization
senders may need separate binding configuration before their queued alerts send.
Code-only deployment inherits live bindings and preserves the minute cron.

Previous API version: `fa3f727c-7093-4fb4-9b87-cd5b2c4f6c40`, source
`f580b12a82e1efb8fa60530bfdd169ffae3560de`. The current checkout has no intervening
API source changes. Migration application and release remain pending until
recorded below. No inbox-delivery claim is made from local tests.
