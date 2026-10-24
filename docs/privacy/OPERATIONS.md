# Retention and deletion operations

Policy owner and escalation: Julian Coy, julian@codecollective.us.
Read [the policy](RETENTION_AND_DELETION.md) before handling data. This runbook
is for human maintainers and agents. Adoption does not authorize bulk deletion
of production data, creation of identity mappings, or bypassing preview/approval.

## Verified implementation status — October 7, 2026

| Control | Evidence/status | Required follow-up |
| --- | --- | --- |
| MCP diagnostic minimization | `org-worker/src/eventMcp.ts` emits method category, status, outcome and duration without arguments/results/tokens | Preserve privacy regression tests; inspect other logging paths separately |
| Token/state expiry | `retention.ts` in both Workers removes expired temporary state in batches of 500; PIdP Python has equivalent cleanup | Verify scheduled execution and backlog logs after deployment; grants and refresh replay evidence are deliberately excluded |
| Account deletion | No complete cross-service erasure workflow verified | Use the manual process below; do not advertise a self-service erasure button |
| Production log retention | Workers Logs has a provider maximum of 7 days; both backend Workers have no Logpush or tail exports; query redaction is enabled in source | Verify redaction on deployment; re-audit any future export destination |
| Backup retention | Actual recovery windows and exports not verified | Inventory D1 recovery, object versions, snapshots and exports; record actual windows and resolve gaps against the 30-day target |
| Periodic retention enforcement | OrgPortal cleanup uses its existing minute cron; PIdP uses a five-minute cron/Python loop | Watch count=500 backlog signals; manual account/content and exception review remains necessary |
| Event company votes | `companyVotes.ts` exposes public totals and the authenticated account's own votes. `profileFavoriteCompanies.ts` additionally lists unexpired favorites only for the owner or on an enabled public profile after owner opt-in; it excludes up/down votes and deduplicates companies. Clearing deletes the row. Sharing preferences cascade with contact-profile deletion and are excluded from public replicas and immutable history. `retention.ts` removes expired records in batches of 500. Unit tests verify isolation, deletion and expiry boundaries | Deploy migration 0080 and verify cron before advertising production cleanup; account deletion must include this store |
| Group mailing lists | Group-specific live organizer authorization; self-only preferences; one-use preview receipts; outbox role/consent rechecks; private segment/audit expiry through bounded retention; isolated regression tests | Verify release/cron; sender setup remains operator-controlled. Account erasure must remove selections, receipts and audit actor links and address older email/journal/provider copies |
| Public website policy | Public `/api/org/privacy`, `/api/org/support`, `/api/org/terms` routes are generated from repository policy documents | Verify deployed content and listing URLs; regeneration is part of the backend build |
| Organization page counters | Anonymous organization/day counts; manager-only API and MCP report; 365-day bounded cleanup in `retention.ts`; lifetime totals cascade on organization deletion. SQL, rollback, access and local browser checks cover counts and tab/reload behavior | Apply migration 0106 and verify scheduled cleanup after deployment before claiming live tracking. Counters are excluded from immutable journal and public replicas. Restore processes must reapply expiry and verified organization deletions |

## Public intervention planning

`ecosystem_initiatives` stores public organization-owned plans;
`ecosystem_initiative_versions` retains their published revisions. `updated_at`
is the annual-review clock, enforced by operator review rather than automated
expiry. A manager-confirmed deletion removes the plan and cascades all versions;
minimal audit entries contain IDs/revision only. Review and remove this minimal
audit within 12 months under the audit policy; no new automatic cleanup is claimed.
Do not enter private people or contact details in public plans. Account erasure
reviews audit actor references under the existing shared-record process.

Include both tables in backup/restore and correction/deletion inventories.
Reapply confirmed deletions before restored data is served and remove related
exports. Browser drafts are page memory only. Production schema/publication and
authenticated browser acceptance are pending; API permission, receipt, stale-edit,
rollback and cascading-deletion checks run against isolated test databases.

## Inventory and monthly review

Production CLI working copies live separately in `~/.orgportal-working-copy`.
They may contain authorized private organization API results and pending draft
arguments. Subject/issuer/resource/org/workflow binding isolates datasets; creation
starts a fixed seven-day clock. Each invocation purges expired records. The
workspace installer `scripts/setup_working_copy_timer.py` installs hourly idle
cleanup through the user service manager. This timer is host-dependent, not proof
of deletion on an offline host. `orgportal working-copy forget --organization ID`
removes local copies without requiring a live grant. Review manual exports and
independent backups during erasure; this store is not added to DR archives. Full
private-domain coverage and authenticated acceptance remain unverified. See
[working-copy operations](../cli/WORKING_COPY.md).

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

## Cleanup inventory and safeguards

OrgPortal: `event_mcp_operations` (milliseconds; only prepared/completed),
`email_oauth_states` (milliseconds), `event_mcp_rate_limits` (minute windows),
`private_newsletter_previews` and `local_newsletter_previews` (UTC ISO strings).
These tables are excluded from change-journal payload replication; production
trigger inspection confirmed cleanup does not archive the removed secrets.
Executing/uncertain operations require operator review and a documented security
exception, with review within 30 days; do not retry provider writes blindly.

PIdP: MCP requests/codes/login handoffs, provider OAuth states, portal SSO,
identity-link requests/previews (seconds); SSO rate windows (minutes) and client
registration limits (hours). Python provider OAuth uses different storage; the
shared persistent MCP/SSO/link tables use equivalent cleanup. Zero-expiry grants
and used refresh hashes are not temporary garbage: removing them indiscriminately
would break persistent connections or refresh-token replay protection.

Every sweep selects rows older than 23 hours after expiry, bounded at 500 per
table. It preserves the boundary, live rows and unrelated account/content data.
A full batch sets `backlog=true`; investigate persistent backlog or error events
before the 24-hour limit is exceeded. These are aggregate logs, never payloads.
Clock/SQL failures must not be reported as successful cleanup.

### Event company vote inventory

`event_company_votes` stores a portal account ID, event/company IDs, direction and
timestamps to enforce one preference per person per company. The retention clock
is `expires_at`, fixed to the ballot's closing time plus 90 days at write time.
Expired rows never contribute to public totals or private saved-vote responses.
The scheduled sweep removes rows older than expiry plus 23 hours, at most 500 per
run. No individual vote rows enter the public organization replica or change
journal. Public totals disappear as votes expire or are cleared.

The authenticated voter can erase a row with
`PUT /api/network/events/:eventId/company-votes/:companyId` and `{ "value": 0 }`,
including after the ballot closes. For verified account erasure, inventory that
account's rows and remove them with parameterized, bounded batches by `user_id`;
never infer the ID from email. Record the minimal deletion ledger, reapply erasure
before any backup restoration and follow the backup process above. Event,
company and roster deletions cascade to their votes. Authentication remains with
PIdP; this feature does not create memberships or authorization grants.

Cloudflare evidence: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
(maximum seven-day built-in log retention at the October 7 review). Account-level
Logpush job inventory was empty; both backend Workers had no tail consumers.
This evidence does not cover independent copies outside this Cloudflare account.

Ecosystem journal coverage: migration 0088 explicitly excludes reproducible
public government/IRS observations from payload journaling; their reviewed source
artifacts and checksums support reconstruction. Initiative content and deletable
revision history are also excluded. Mutations retain only organization ID and
revision in the existing minimal audit metadata; do not add plan content to the
immutable journal. Apply the manual audit retention and backup-restoration rules
above. This is not an automated annual deletion job.

## Organization follows and event notifications

Follows are private account preferences, separate from memberships and permissions.
The preference persists while following, and Unfollow physically removes that
account's row. The Following feed derives public upcoming events from current
preferences. Newly inserted public events enqueue bounded in-app notification
work for existing followers; following does not create a historic notification backlog.
Completed work is removed immediately, undelivered work expires after seven days,
and organization-event notifications expire 90 days after creation. The minute
retention job removes at most 500 eligible rows per table per run.

Neither follow preferences, notification jobs nor organization-event notices enter
public organization snapshots or the immutable change journal. Other notification
categories retain their existing journal behavior. In-app delivery uses the
existing notification inbox; this feature sends no email or browser push.

For verified account deletion, inventory and delete `organization_follows` and
`user_notifications` by the canonical `user_id`, using parameterized bounded
batches and the existing deletion ledger. Jobs retain only the last recipient ID
as a pagination cursor, for at most seven days. Reset matching `last_user_id`
cursors to the empty string during erasure; deterministic notification IDs make
replayed pages inert. Delivery rechecks live follows, so deleted preferences
cannot generate new notices. Organization and event deletion cascade their related work.
Include these stores in backup inventories and reapply the account erasure ledger
before restoring any backup; deletion from independent exports or old backups
requires the existing operator process. Do not infer ownership from email.

Outreach rollout: migration 0091 adds private campaign source/review metadata, optional Gmail bounce monitoring, 50-attempt gates and 90-day outreach/report retention. Tests verify account/group isolation, report-only imports, opt-out/bounce exclusion and self-test enforcement. Migration 0091 was applied in production on 2026-10-18; the release flow verified frontend/API commit c11ed78. Expiry and cascade behavior pass SQLite integration tests; execution of an aged outreach purge on the live cron has not yet been observed. Optional Google read-only monitoring requires explicit reconnection before it runs. Existing older campaign/sender journal copies are not automatically erased by this migration.

## Presentation applications

Migration 0092 adds event presentation forms and private submissions. Submissions
expire 90 days after the event end (or start if no end); retention deletes up to
500 expired records per run. Managers of the submitting organization can withdraw
them; host managers review them. Account erasure must remove rows where
`submitted_by` matches the verified subject. Organization/event deletion cascades.
These private tables are excluded from the public replica and public history.
Include both tables in backup inventories; reapply withdrawals, expiry and
verified erasure before restoring service and delete task exports. No separate
notification, email or provider copy is created. Deploy migration and verify cron
before advertising automatic cleanup in production.

## Organization directory and authority corrections

Directory reads expose existing public organization fields and claimed/unclaimed
status, without member identities or permission grants. Registration audits retain
only the public evidence URL and operation receipt; do not copy the full profile
or private outreach into immutable audit metadata. These contributions use the
existing shared organization record review and deletion process.

Self-service ownership correction preserves the public organization, deactivates
the actor's membership, and removes the active claim only when there is no portal
binding or challenge history. A minimal `organization.ownership.released` audit
retains the claim ID, start/end timestamps, reason code and receipt. This is an
access correction, not account erasure or a verification of representation.

Include actor/subject references, ownership-correction audits, operation receipts,
inactive membership rows, prior journals and backups in the existing manual
account-erasure inventory. Apply the established 12-month audit review and
receipt cleanup rules; no new automatic retention control is claimed. Public
replicas must receive the resulting unclaimed state and must not reintroduce the
removed claim after refresh or restoration.

## Organization personnel indicators

Migration 0094 adds `organization_volunteer_awards`,
`organization_personnel_motions`, and `organization_personnel_votes`. Only apply
it after schema review. Test local expiry, revocation, organizer-only ballot
reads, role changes between preview/apply, and two-organization isolation before
release. No production migration or browser acceptance is claimed by unit tests.

Expired volunteer awards are ignored synchronously and cleaned in batches of
500 by `runRetention`. Watch cleanup backlog. Review conduct records with
`review_at <= now` at least monthly; record continued necessity or arrange
correction/deletion through verified authority. A two-year review is not an
automatic readmission. Restrict procedural records and ballots to organizers;
member-visible indicators expose only the resulting class.

For verified account erasure, inventory awards by `user_id` and `awarded_by`;
conduct motions by target/proposer/seconder/chair and `electorate_json`; votes by
`user_id`. Review/redact retained shared decision identifiers under the existing
shared-record policy, or delete motions (ballots cascade). Organization deletion
cascades all three stores. Include ordinary D1 backups and exports in the
inventory, and reapply erasure/correction ledgers before restoring service.
These records must not be added to public replication or immutable journaling.


## Local form-draft storage

`orgportal.form-draft.v1:<encoded-account-id>:<resource-scope>` contains only
response fields and a save timestamp, expires on read after 30 days, and is
removed by the clear-draft control or successful form confirmation. Account and
resource changes must never restore another scope's responses. For verified
account erasure on a device, remove that account's scoped keys or clear site
storage. No server copy, replica, journal, or server-backup cleanup is required;
consider browser/device backups separately. Never persist bearer tokens or
preview/apply receipts. Test reload recovery, blocked/quota storage, explicit
clearing, successful submission clearing, and the Gold indicator against actual
localStorage contents. The indicator is local persistence, not server approval.

For verified account erasure, include `organization_invitations`: delete rows by
`accepted_user_id`, `invited_by`, and verified recipient email. Include outstanding
invitations when an inviter loses permissions or requests revocation. To revoke,
set `status='revoked'`; acceptance and queued delivery both require pending status.
Never record invitation emails in public replicas or journals. After a backup
restore, reapply erasures and run invitation expiry cleanup before serving traffic.
Invitation delivery requires `EMAIL_SENDING_ENABLED=true`, a connected Gmail sender
with live organizer rights in the invited organization, and the existing configured
public portal URL. Missing senders leave mail queued; ambiguous deliveries are
marked uncertain and require manual Sent-mail review rather than automatic retry.

Event application CSV exports require live host-organization management access
and include only unexpired proposals matching the selected status. Exports contain
team names, proposal text, submitter account IDs and update times. They do not
create another server-side store. Treat downloaded files as private organization
records; include retained exports in the organization's deletion and sharing process.

For account erasure, delete `event_submission_favorites` and legacy `event_presentation_favorites` rows using the verified canonical `user_id`. These private choices have no journal or replica copies. Record the erasure under the existing backup handling procedure. Do not select an identity by email.

Also delete `event_presentation_final_ballots` by that verified `user_id`; final-round ballots are separate from preliminary favorites. Repeat the deletion before serving a restored backup. The hourly retention task cleans final ballots and round settings on their original event/submission expiry clocks. Withdrawal cascades ballot deletion; closing or reopening voting preserves the existing single-choice ballots and locked shortlist.

For submission attachment erasure, first revoke the proposal/download access, then delete the referenced `submission-attachments/` R2 objects before deleting their `event_presentation_attachments` rows. Preserve failed-deletion rows for retry; do not delete metadata first. The hourly `cleanupPresentationAttachments` job handles expired proposals, withdrawn/deleted parents and abandoned pending uploads. Scope erasure by verified canonical proposal ownership, event and organization; filenames and email addresses do not establish identity. Include stored object copies in the existing backup-erasure procedure.

For presentation erasure, remove matching legacy `event_presentation_submissions` first (its rollout mirror removes the corresponding migrated entry), then matching `event_submissions`. Remove entries by verified submitter or authorized team/event scope as appropriate; never infer identity from email. Keep attachment metadata until the R2 cleanup has succeeded. Migration 0099 preserves existing IDs, choices and file targets; both compatibility tables retain their original expiry clocks.

For verified account erasure, also remove matching `userId` references from `event_submissions.presenters_json` using the canonical ID. For invitation erasure remove matching `invitationId` references before deleting the invitation. Removing a presenter never grants or revokes management permissions. Presenter data expires with the parent proposal and is not copied to immutable journals or public replicas.

Five over Five erasure: on a verified canonical subject ID, delete
`organization_recognition_ballots WHERE user_id = ?` and
`organization_recognition_nominees WHERE submitted_by = ?`. Nominee deletion
triggers remove its votes and trim remaining ballots; inspect affected aggregate
counts, not other users' private ballots. Both stores are excluded from journal
replication. Reapply verified deletion requests to any restored backup before
serving it. Ordinary self-service deletion uses the scoped nomination/ballot
DELETE API. Hourly retention removes expired rows in bounded batches.

### Organization member descriptions

Migration 0108 adds a nullable, 600-character `organization_memberships.description`;
0109 includes it in the existing restricted membership journal. Public Board and
Personnel responses expose it only for active memberships. Public-profile bio and
headline fallbacks require an enabled profile. Managers can clear overrides via
the existing member-title preview/apply operation using `description: null`.
On verified erasure, clear descriptions together with titles and portraits (or
remove the membership); review journal retention separately and reapply verified
erasures after backup restoration. Annual public-record review and existing
membership deletion processes cover this field; no automatic erasure is claimed.

### Consented personnel relationships

Migration 0112 adds invitation intent/blocker fields and private, revocable relationships. For verified erasure run parameterized deletion of `organization_personnel_relationships WHERE user_id = ?` and clear `confirmed_by` for the canonical subject on remaining rows. Apply the existing invitation/membership/profile erasure steps separately; do not infer identity from a matching email. Verify public Board/Personnel no longer returns removed relationship labels, and repeat deletions after a backup restore. Relationships and evidence never enter immutable change-journal copies or public snapshots. Expired relationships are excluded from reads and removed by the bounded retention job. Local authenticated tests must keep mail disabled and use synthetic accounts.

For guest presentation applications, verify the requester's identity before erasure.
Delete rows in `event_guest_presentations` by canonical `claimed_by_user_id` for
account erasure; verify email ownership separately for unclaimed submission
withdrawal. This removes acknowledgement status and claim metadata with the
proposal. Reapply verified erasures before serving restored backups. Claiming a
submission never grants access to an existing organization. Explicit confirmation
creates a new owned team and a pending invitation for the supplied teammate. Existing
unclaimed applications are not sent thank-you emails retroactively.
