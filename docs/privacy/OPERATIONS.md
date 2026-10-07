# Retention and deletion operations

Policy owner and escalation: Julian Coy, julian@codecollective.us.
Read [the policy](RETENTION_AND_DELETION.md) before handling data. This runbook
is for human maintainers and agents. Adoption does not authorize bulk deletion
of production data, creation of identity mappings, or bypassing preview/approval.

## Verified implementation status — October 7, 2026

| Control | Evidence/status | Required follow-up |
| --- | --- | --- |
| MCP diagnostic minimization | `org-worker/src/eventMcp.ts` emits method category, status, outcome and duration without arguments/results/tokens | Preserve privacy regression tests; inspect other logging paths separately |
| Token/state expiry | PIdP `serverless/src/mcpAuthorization.ts` checks expiry and removes some consumed/expired state | Expiry is not comprehensive physical deletion; inventory all temporary tables and enforce the 24-hour cleanup target in both PIdP implementations |
| Account deletion | No complete cross-service erasure workflow verified | Use the manual process below; do not advertise a self-service erasure button |
| Production log retention | Observability is enabled; provider retention settings not verified | Record actual settings for each Worker and any export destination; configure at most 30 days for routine logs |
| Backup retention | Actual recovery windows and exports not verified | Inventory D1 recovery, object versions, snapshots and exports; record actual windows and resolve gaps against the 30-day target |
| Periodic retention enforcement | Existing scheduled handler handles other operational work, not a complete retention sweep | Owner conducts monthly inventory/review; automation remains open work |
| Public website policy | Existing `/terms` predates this policy | Publish a synchronized user-facing notice before claiming the website or submission URLs cover these rules |

## Inventory and monthly review

Maintain a restricted operational inventory outside this public repository:
store/table/bucket, data categories, owner, purpose, subject keys, timestamp
semantics, dependencies, replicas, provider, configured retention, deletion
method, last verification and evidence. Include OrgPortal D1 and journal DB,
PIdP stores, media objects, chat services, email queues and provider copies,
newsletter originals/history, logs, backups, local replicas and temporary exports.
Never commit real subject identifiers, requests, credentials or deletion evidence.

Every month review overdue data, unresolved requests and exceptions. Review
shared records annually and inactive accounts at the policy threshold. If last
activity is not reliably recorded, do not infer inactivity from account creation.
Collect/configure the required evidence before enabling an automatic sweep.
An exception needs an owner, narrow scope, reason, expiry and next review date.

## Manual deletion workflow

1. Open a restricted ticket; record received/verified dates and scope. Acknowledge
   within 7 days. Verify account control without collecting unnecessary ID.
   Resolve the immutable PIdP subject and tenant context through trusted account
   interfaces; never grant privileges or map identities by email alone.
2. Inventory matching records and dependencies across the stores above. Separate
   identity-wide deletion from a single tenant/membership/content request.
   Identify shared content, legal holds and provider-owned copies. Produce a
   reviewable dry-run with counts and intended effects; keep the details private.
3. Confirm the destructive scope with the requester. Revoke applicable grants
   and sessions via PIdP, pause queued work and stop integrations recreating data.
   Preserve unsubscribe/suppression protection while minimizing its identifiers.
   Do not cancel other people's resources or erase shared governance blindly.
4. Use supported APIs where possible. Any necessary database migration must be
   schema-reviewed, subject-scoped, resumable and tested on isolated synthetic
   fixtures. Remove personal content/media and unlink or anonymize shared records
   as justified. Pseudonymized linkable IDs still count as personal information.
5. Propagate to authoritative replicas, journals, caches, search and downstream
   services. Prevent replication or email retries from resurrecting records.
   Coordinate identity deletion upstream with PIdP instead of adding credentials
   or a second account deletion authority inside OrgPortal.
6. Verify absence using authorized reads and verify revoked access fails. Record
   per-store outcomes, remaining exceptions and recovery-copy expiry dates.
   Do not label a partial failure complete; resume from the restricted ticket.
7. Tell the requester the actual result within the 30-day target, or explain the
   delay and next action before it expires. Retain only the minimal audit for
   12 months. Never copy deleted payloads into an audit ticket or repository.

## Backups and restoration

Restrict recovery-copy access and let verified rotation remove residual copies;
do not promise immediate physical erasure from immutable backups. Keep a minimal,
restricted deletion ledger with the identifiers necessary to reapply deletions
for the longest verified recovery window. Remove those identifiers after all
relevant copies expire; keep only non-content completion evidence thereafter.
Restore into isolation, reapply the ledger, verify deletion and revocation, and
only then resume traffic/replication. A backup older than the available ledger
must not be restored to production without reconciling all intervening deletions.

## Agent implementation rules

- New data features must define purpose, subject ownership, retention clock,
  deletion API/job, downstream propagation and backup behavior in the inventory.
- Use UTC timestamps and explicit cutoff boundaries. Cleanup must be bounded,
  idempotent and retryable; no unbounded delete from a request handler.
- Test expiry boundaries, tenant isolation, holds, shared records, partial failure
  recovery and prevention of resurrection using synthetic fixtures.
- Do not create a global production purge to make this policy appear enforced.
  Deletion jobs require a reviewed inventory, dry-run counts and proper authority.
- Keep policy, actual configuration and public notice consistent. Mark unverified
  controls honestly; passing unit tests is not proof of production erasure.
