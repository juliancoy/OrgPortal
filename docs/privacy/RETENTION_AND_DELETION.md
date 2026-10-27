# OrgPortal retention and deletion policy

Effective October 7, 2026. Owner: Julian Coy. Support, privacy and deletion
requests: **julian@codecollective.us**. Review this policy at least annually and
whenever a new data category, processor or integration is introduced.

OrgPortal is currently free and open-source software with no in-app purchases.
This policy applies to the operated OrgPortal service and its ChatGPT/MCP
integration. Independent self-hosted operators are responsible for their own
practices. The software license is not a privacy policy for their deployments.

## What we use and share

OrgPortal uses account identifiers, profiles, memberships, roles, event records,
messages, uploaded media and other community content to provide requested
features and enforce permissions. PIdP manages sign-in, credentials, sessions,
provider connections and OAuth grants. Cloudflare hosts the deployed services.
Group mailing-list subscriber data is visible only to active group owners and
organizers. Membership does not imply email consent. Subscribers control their
own preferences, and unsubscribes apply before queued delivery.
Authorized organization administrators and recipients can access information
according to its visibility and their permissions; public content is public.
Profile availability is visible to its owner and, when sharing is enabled, to
signed-in people who also share a saved upcoming schedule through a public
profile. Visitors who have not shared a schedule receive no availability slots.

When you use OrgPortal through ChatGPT or another MCP client, that client sends
tool arguments and receives authorized tool results. Those results may contain
organization or personal information. Review requested permissions and avoid
requesting information you do not want included in your conversation. The client
and any connected provider manage their own copies under their own policies.
Removing an OrgPortal record does not delete an existing ChatGPT conversation,
a recipient's copy, an exported file or a third-party calendar event.

Favorite companies are derived from unexpired favorites ballots and shared only
when the account owner enables sharing and their profile is public. Clearing a
favorite removes it from the list unless it is also selected in another ballot.
The sharing preference is retained with the contact profile and deleted with it;
private preferences and ballot choices are excluded from public replication and
immutable history. No separate copy of favorite history is retained.

Signed-in search ranks public results using existing memberships, accepted
connections, event registrations, and unexpired company favorites. These signals
are not included in search responses or copied into a new store. Guest search
uses text relevance. Personalized responses are not publicly cached.

## Retention schedule

Website observatory reports contain minimized synthetic browser measurements of the
allowlisted CodeCollective and LifeTech public homepages. They are private to PIdP
system administrators and stored under the private website-observatory prefix in
Cloudflare R2. Request origins, response codes, byte counts, timings, public server
IPs and browser/collector versions are retained for 30 days; URL paths, query strings,
request/response bodies, cookies, account tokens and visitor identifiers are not stored.
Expired reports are hidden immediately and removed by the existing minute cron in
bounded batches. Administrators can delete individual reports through the protected
observatory API. These operational reports do not enter the immutable change journal,
organization replication, or public media indexes. The probe retains a separate local
30-day copy; deleting a hosted report does not remove that local copy or an existing
backup. The probe's sync ledger prevents an acknowledged hosted report from being
re-uploaded. Deletion requests must cover both copies and any backups; apply the same
30-day expiry when restoring a backup. Capture-control metadata contains a request
timestamp only, without an administrator identity. The dedicated probe credential can
only upload validated observations and read capture requests; it cannot read reports,
queue captures, manage organizations or access PIdP accounts.

Site-wide visitor reporting uses Cloudflare Web Analytics aggregates, separate from account,
membership and audit activity. OrgPortal retrieves daily hostname totals and
popular page paths for administrators without storing a separate visitor history,
visitor identifiers, or analytics backups. Cloudflare manages collection and
retention; see [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/).

Organization-page reporting separately stores anonymous totals per organization
and UTC day. It does not store visitor IDs, accounts, IP addresses, referrers,
user agents, URLs with query strings, or cookies. The counting request omits
credentials, and the browser keeps no persistent tracking identifier. Daily
buckets expire after 365 calendar days, including today, through bounded
scheduled cleanup; expired buckets are immediately excluded from reports.
Lifetime aggregate totals last while the organization exists. Deleting the
organization cascades both counter tables. These aggregates have no account
subject to erase and are excluded from the immutable journal and public replica.
Reports require current organization management access. Normal D1 backup rules
apply; reapply verified organization deletions and expiry before serving a
restored database. There is no separate visitor-history export or backup store.

These are adopted operational limits and review deadlines, not a claim that
every store already has automatic expiry. Temporary authorization state and
completed/unused preview receipts have scheduled cleanup; account erasure and
shared-content review remain operator-managed. Current controls and implementation
gaps are tracked in [operations](OPERATIONS.md). The owner must perform manual
reviews where automation is missing and record exceptions rather than silently
retaining data indefinitely. Shorter configured retention takes precedence.

| Data | Retention rule | Purpose |
| --- | --- | --- |
| Active account and private service data | While needed to provide the account; review accounts after 24 months of inactivity, notify before closure, and allow 30 days to respond | Service continuity without indefinite unattended retention |
| Account data approved for deletion | Target removal from live systems within 30 days of a verified request; explain any delay or exception before that deadline | Timely removal and accountable handling |
| Public organization, event and governance records | Review annually and on deletion requests; remove unnecessary personal identifiers, retain shared records only for a documented continuing organizational purpose | Preserve shared history without blanket permanent personal-data retention |
| Presentation applications | Private to submitting organization managers and event-host managers; expire 90 days after the event ends, hidden at expiry and removed by bounded cleanup within 24 hours; team managers can withdraw immediately | Review team presentations |
| Event company votes | Expire 90 days after the ballot closes; exclude expired votes from totals immediately and remove personal records within 24 hours of expiry through bounded cleanup; voters can clear each vote at any time | Per-company up/down preferences or a bounded favorites ballot per account; expose totals; owners can opt in to listing their selected favorite companies on an enabled public profile |
| Organization follows and event notices | Follow preferences last until unfollow or account deletion; notification work expires after seven days or delivery; organization-event notices expire 90 days after creation | Private personalized event feed and requested in-app notifications |
| Group email segments and mailing audit | Segments and minimal audit expire one year after creation; omit expired records from the UI immediately and remove them through bounded cleanup within 24 hours | Keep subscriber selections and organizer activity private and bounded |
| Routine application and request logs | Maximum 30 days | Diagnose faults and availability |
| Security incident evidence | Maximum 90 days unless an active documented investigation requires longer; review extensions every 30 days | Investigate abuse and protect accounts |
| Expired or consumed temporary OAuth state and previews | Remove within 24 hours after expiry/consumption; protocol validity remains much shorter and unchanged | Finish authorization and prevent replay |
| Credentials, sessions and delegated grants | Revoke promptly when access is withdrawn or account deletion begins; coordinate physical deletion with PIdP and providers | End access, separately from erasing stored records |
| Support correspondence | Delete or anonymize within 12 months after closure | Resolve follow-up questions |
| Minimal deletion audit | 12 months after completion, restricted access, request ID/dates/actions/exceptions only | Demonstrate completion without retaining deleted content |
| Backups and recovery copies | Target a maximum 30-day rolling window; verify each provider's actual window, document any mismatch and corrective action | Recovery with bounded residual copies |
| Development fixtures and exports containing personal data | Prefer synthetic data; approved temporary exports deleted within 7 days after their task finishes | Avoid uncontrolled extra copies |

Do not retain raw access/refresh tokens, passwords, authorization headers, full
tool arguments/results or message contents in diagnostic logs. Non-identifying
aggregate metrics may be kept longer only if re-identification is not possible.

## Requesting deletion

Email julian@codecollective.us with the account and scope you want removed.
Do not send passwords, tokens or identity documents. We verify control using an
existing authenticated account or another proportionate secure method before
making destructive changes. A request concerning one organization is not an
instruction to delete a shared identity across every tenant.

We aim to acknowledge requests within 7 days and complete verified requests
within 30 days. These are service targets, not a substitute for any applicable
shorter deadline. We explain what was removed, what remains, why it remains and
when it will be reviewed. Shared records may be anonymized rather than deleted
where needed to preserve other members' records. A legal or active security
hold must be specific, restricted, documented and periodically reviewed.

Disconnecting ChatGPT stops that connection; it does not automatically erase
your OrgPortal account. Deleting an account requires coordinated work across
OrgPortal, PIdP, media, messaging, queues, replicas and relevant providers.
Recovery copies may persist until their verified rotation date. They must not
be used for normal service and deletions must be reapplied before restored data
is made available. We cannot erase copies controlled by independent recipients.

## Basis and limits

The chosen periods are OrgPortal operational decisions, not universal legal
requirements or a claim of worldwide compliance. The design follows purpose
limitation, data minimization, periodic review and accountable erasure described
in the [ICO storage limitation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/).
Changes to actual behavior, published notices and these documents must stay in sync.

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

## Recipient contact suppression

`email_contact_suppressions` keeps a normalized recipient email address, sending
organization ID, source, and first/last opt-out timestamps. This is a private
contact preference in the organization database, shared across that group's
announcements and event invitations. An address can be a personal contact or an
organizational role inbox; it does not establish account ownership or opt out an
entire recipient organization. Public contacts/imports never override this state.
Existing account subscriptions are updated when the same address opts out.

Suppression is retained while the mailing group exists to prevent reimporting
an opted-out address. `updated_at` is the annual operational-review clock; it is
not an automatic expiry that would silently permit sending again. A verified
recipient can explicitly re-consent to that group; group deletion cascades, and
verified erasure requests remove matching address rows through the manual
privacy workflow. Restore operations must reapply opt-outs and erasure requests
before resuming delivery. The table is excluded from public replicas and the
immutable change journal; it remains in protected operational database backups.
Encrypted unsubscribe links do not expire and contain no plaintext address.
Keep their encryption key stable; do not rotate it without retaining decryption
support for previously issued links. These links authorize only opting out.

## Campaign engagement

New OrgPortal campaign sends measure image loads, link clicks and opt-outs through
that email's unsubscribe link. The message footer discloses this measurement.
Image blocking, privacy proxies, forwarding and security scanners mean open and
click signals are estimates, not proof a person read or clicked. Tests are excluded.
Each rate counts unique recipients among tracked, Gmail-accepted campaign sends;
the three rates overlap and must not be summed. Gmail acceptance is not delivery.

`email_engagement` links a delivery ID to first-action timestamps and a 90-day
expiry measured from initial send preparation. It stores no IP or user agent.
The existing scheduled retention job deletes expired rows in batches of 500,
even when sending is disabled. Reads/writes exclude expired data immediately.
Older sends are not backfilled; expired/untracked data is shown as unavailable.
No permanent engagement aggregates are retained. Signed click destinations remain
usable after analytics expire, and opt-outs remain valid indefinitely.

This store is excluded from public replicas and immutable change journals.
Deletion of a campaign/delivery cascades; verified erasure must also inventory
these rows by the delivery's canonical account/address under the manual workflow.
Unsubscribe suppression is independent and is not removed by analytics expiry.
Protected operational backups may contain older data: reapply erasure and expiry
before restoring service and inventory independent exports under OPERATIONS.md.
The application does not log tracking tokens, addresses, IPs or user agents;
provider request logs remain subject to the separately documented log controls.

## Reviewed one-time email outreach

An organizer can import a source-backed list for one campaign without subscribing
any contact or treating portal login as consent. The private campaign recipient
snapshot holds source URLs, check dates, review state, mail-routing results and
provider receipt/failure IDs. Draft, paused and completed outreach campaigns and
report-only imports expire 90 days after creation/import; the existing bounded
retention job deletes them and cascades recipients, previews and engagement.
Expired campaigns are not eligible for dispatch. Queued expired campaigns are
paused before sending, then removed on a subsequent retention run.

New campaign content, inline JPEG/PNG photos and Google connection state are
excluded from the immutable journal and public replicas. This does not erase
older journal entries, provider mail or independent exports: inventory and handle
those under OPERATIONS.md and reapply deletions when restoring backups. Account
erasure must remove the owner's campaigns and bounce-processing receipts; group
deletion must also inventory these owner records. Every temporary export retains
its own seven-day task review deadline.

`email_bounces` stores a group/address, provider reason, notice ID and first/last
failure timestamps to prevent further delivery attempts. It is distinct from
unsubscribe state and retained while the mailing group exists, with annual
operational review using `updated_at`. Corrections and verified erasure follow
the existing manual process; removing a failure must never clear an opt-out.
Group deletion cascades this protection. Include it in protected backup and
restore inventories and reapply failure/opt-out corrections before sending.

Optional delivery monitoring requests Google Gmail read-only permission in a
separate, visible reconnect flow. It reads delivery-failure notices, matches the
original recipient and message ID against this connected owner's campaigns,
and stores only the failure evidence needed for the recipient record. Full
mail bodies are not retained or logged. Private processed-notice identifiers
expire in 30 days through bounded cleanup. Imported historical Gmail campaigns
have no fabricated opens/clicks; analytics show those measurements as unavailable.

## Organization personnel indicators

Avatar classes are scoped to one organization. Attendee status derives from an
RSVP for an upcoming event or an event within the preceding three calendar
months. Stakeholder status derives from active membership in a directly
supporting or supported organization using the existing evidence-backed support
and financing edges. These derived classes do not create separate histories or
grant membership or technical permissions.

Volunteer awards store organization/account IDs, awarding account, award time,
and a three-calendar-month expiry. They stop affecting indicators at expiry;
the bounded retention job deletes expired awards. The awarding member or an
organizer can revoke an award. Organization deletion cascades these records.

Personnel conduct motions and ballots are restricted to organizers. Only the
resulting class is included in the member-visible status lookup; procedural
notes and individual ballots are not. Motions have a two-year `review_at` clock
for operator review of continued necessity, correction, and reapplication;
exclusion does not lapse automatically. This review is manual. Deleting a motion
cascades its ballots. The platform's existing verified account-erasure process
must review target, proposer, seconder, chair, electorate and voter identifiers,
including aggregate-result preservation where continued retention is justified.

These stores are excluded from public organization replicas and the immutable
change journal. They remain in ordinary database backups until the applicable
backup window expires. Reapply the verified erasure/correction ledger before
restoring service; delete related exports. Avatar lookup results are held in browser memory only. Presentation and
participation form drafts use the local-only draft policy below. Production migration and cron verification
remain required before advertising deployed cleanup.


## Local form drafts

Presentation applications and organization participation forms save response
fields (including staged team members’ names, account IDs, public avatar URLs and invitation email addresses) in browser localStorage, isolated by signed-in account and event or
organization. No credentials, tokens, one-use preview receipts, or server
permissions are saved in these drafts. A BioTech Gold border means the current
fields match a verified local write; it does not mean the form was submitted.

Drafts expire after 30 days and are discarded when next opened. “Clear saved
draft” removes the current local record; a successful submission or confirmed
participation update also removes it. Drafts remain local across reloads and
sign-outs, and another account does not restore them. They are not sent to a
server, replicated, or included in server backups. Browser/device backups may
retain local storage under the device owner's policies. Verified account erasure
on a device must clear its scoped draft keys or the site's browser storage.

Organization invitations hold the normalized recipient email, organization, purpose,
inviter, delivery state, and accepting account ID for seven days from creation.
The hourly retention job removes expired invitations in batches; acceptance stops
at the expiry time even before cleanup. They are excluded from public replication
and immutable journals. Organization deletion cascades. Verified erasure requests
must delete invitations by accepting account, inviter, and verified recipient email;
restore procedures must repeat that deletion and expiry cleanup before serving.
The existing backup expiry policy applies. Gmail Sent mail is a separate provider
copy subject to the sender's retention and erasure process. Invitations do not
subscribe recipients to mailing lists or create identities from email addresses.

Signed-in team-member lookup searches existing portal contact, membership and individual account records by name or exact email, including profiles not published in the public directory. It returns only the account ID, display name, email and available avatar; it creates no identity or persistent search history. The public directory continues to exclude unpublished profiles.

Public organization directory pages, profiles, support reports and ecosystem snapshots share the `orgportal-public-organization-data-v1` IndexedDB cache within each site origin. Reads revalidate after five minutes; saved public responses remain available until replaced or the visitor clears site storage. Public reads omit credentials, and membership, permission, invitation, newsletter and draft data are excluded from this shared cache. Other tabs receive only a public URL notification and read the saved response from IndexedDB; different domains retain separate browser storage.

Event presentation titles, summaries, team names and review status are publicly listed under Submissions. Submitter identity and roster contact information are not included in that projection. Presentation favorites are private per-account preferences, limited by the event manager’s configured maximum (three by default); public pages show aggregate counts only. Favorites expire with the associated proposal (90 days after the event), are deleted by withdrawal through a cascading foreign key, and are excluded from public replicas and immutable journals. Account erasure must delete favorite rows by user_id, and backups follow the existing erasure and retention policy.

Submission attachments are public once uploaded to a saved proposal. The existing private R2 bucket stores their bytes under `submission-attachments/`; deletable D1 metadata records the event/team, filename, MIME type, size, checksum and expiry, without copying credentials or uploader identity. There are at most ten files per submission, twenty MB each. Download access ends immediately when a proposal expires or is withdrawn. The hourly retention job deletes expired, abandoned (pending for fifteen minutes) and orphaned objects in bounded batches, deleting metadata only after R2 deletion succeeds; failures retain the key for retry. Event or organization deletion therefore cannot lose cleanup metadata. Metadata and file bytes are excluded from public replication and immutable journals. Completed downloads and browser/device backups remain with their recipients; server backups follow the existing expiry and erasure procedure. Selected, unuploaded files stay only in the open form and are not written to the shared public cache or localStorage.

Multiple presentation entries use `event_submissions` and `event_submission_favorites`, with a separate submission ID per event. The same expiry, withdrawal, account-erasure and backup rules above apply to every entry and its favorites. Edits remain available until expiry, return decisions to pending review, and never extend retention. Attachments now identify their individual submission. The old presentation tables are temporary rollout compatibility copies: migration 0099 mirrors old Worker writes one way, and bounded retention expires both stores on the original clock. New Worker writes use only the new tables. Erasure must cover both old and new stores so compatibility copies cannot restore erased records.

Presentation final rounds store the host-selected submission IDs and voting phase in `event_presentation_final_rounds`. `event_presentation_final_ballots` stores one private account ID and chosen submission per event, separately from preliminary favorites. Public results expose aggregate counts only; an authenticated account can read only its own ballot. Both tables expire 90 days after the event; ballot expiry never exceeds the chosen submission's expiry. Expired records stop serving immediately and the bounded hourly retention job removes them within 24 hours. Withdrawal or deletion of the submitting organization deletes ballots for that submission; event deletion deletes the round and all its ballots. Account erasure deletes final ballots by verified canonical `user_id`. These tables are excluded from immutable journals and public replication. Backup expiry and restore-time erasure rules above apply; no browser ballot history is stored.

Presenter selection is separate from organization management. Creators retain management access without being implicitly named as presenters. `event_submissions.presenters_json` stores selected canonical member IDs or pending invitation IDs, with the proposal's existing expiry and deletion path. Public projections show selected presenter display names and enabled public portraits; pending invitees appear only as “Invited presenter,” with no address or identifier. Team and event managers can review the roster. Accepted invitations are converted to the verified recipient's canonical user ID before invitation expiry cleanup. Presenter references are excluded from immutable journals and public replicas along with their parent proposal; backups follow the same erasure policy.

### Community recognition (Five over Five)

`organization_recognition_nominees` holds explicitly public, permission-attested
names, accomplishments, community connections and optional HTTPS work links,
plus a private submitter ID for withdrawal. No date of birth is collected; the
nominator attests that the person is older than five. Nominations expire 365 days
after publication. `organization_recognition_ballots` holds a private canonical
voter ID and replaceable selections; each save expires after 365 days. API reads
exclude expired rows immediately; the hourly bounded retention job deletes them.
Both tables are excluded from immutable journals and public replicas. Public
responses expose nominee details and aggregate counts, never author/voter IDs.

Authors may delete nominations; live owners/administrators may moderate them.
Deleting a nominee removes its selections and trims ballots to the reduced
25%-rounded-up allowance. Voters can deselect choices or DELETE their ballot.
A reduced allowance keeps earliest selections; expired nominees never count.
Support erasure removes rows by `submitted_by` and `user_id` respectively.
Apply these deletions again after restoring a backup, before serving requests;
provider backup retention and the existing restore restrictions still apply.

### Organization titles and public Board

Membership `titles_json` holds up to eight informational role titles (for example
CEO or Advisor), with the membership's existing lifecycle. The role editor and
MCP preview explicitly identify publication: assigned titles and display names
appear on that organization's public Board. Email, canonical identity IDs, and
private profile images are excluded from the public projection. Card IDs are
hashed per organization. Public profile images appear only when the person's
profile is public; otherwise the card uses initials. Existing constitution-based
personnel classifications still control avatar borders.

Clearing titles removes the person from the Board immediately. Removing the
membership deletes its titles. Support erasure clears `titles_json` on the
verified subject's memberships; repeat verified deletions on a restored backup
before serving it. Title previews use the existing expiring operation receipts;
title assignment does not grant permissions. Changes also enter the existing
atomic membership audit journal, including before/after titles, under its existing
restricted access, retention and backup rules; clearing the live field does not
remove immutable journal history. No additional history store is created.


The Personnel tab includes active members with published titles, an explicitly
published organization-specific portrait, or an enabled public profile. Optional
`portrait_json` stores a public HTTPS image URL and source page on the membership.
A manager's preview explicitly publishes the portrait and source; it never
changes the account's personal photo. Private profile images remain excluded.
The external image is loaded by the browser without a referrer and is not copied
into an additional image store. Removing a portrait clears the live override;
membership deletion removes it, and support erasure clears it alongside titles.
The existing restricted membership journal records changes and follows its
existing retention/restore restrictions. Apply verified erasures again after a
backup restore. No automatic identity matching or access grants use photos.

Board and Personnel introductions may include a manager-published description
of up to 600 characters on the existing membership. Without an override, only an
enabled public profile's bio or headline is displayed. Descriptions do not alter
personal profiles or membership permissions. They remain while the active
membership needs them, subject to the annual public-record review above; inactive
or deleted memberships are not published. Managers clear the live override with
`description: null`; verified subject erasure clears this field alongside titles
and portraits or deletes the membership. The existing restricted membership
journal records before/after descriptions and uses the same review, erasure and
backup restrictions; clearing live copy does not erase immutable history. Reapply
verified removals to restored backups before serving them. No additional personal
history store or public replica of memberships is created.

Personnel invitation intents remain in the existing seven-day private invitation store. Delivery blockers contain enumerated operational reasons, never raw provider responses. Accepted `organization_personnel_relationships` stores canonical user ID, display name, class, consent time, confirmation state and optional supporting evidence URL/confirming actor. Public personnel responses expose only active classes and display names, public-profile links/photos, and organization-scoped opaque identifiers; pending classes, recipient emails and evidence are private. Both active and pending relationships expire 24 calendar months after acceptance; bounded scheduled retention removes expired rows. Reads exclude expired rows immediately. Recipients may remove their own relationships, managers may remove any in their organization, and deleting an organization cascades its relationships. This store is excluded from immutable journaling and public replication.

On a verified account-erasure request, delete relationships by canonical subject ID and clear that subject's `confirmed_by` references on remaining relationships. Reapply verified erasures to restored backups before serving them. Removing an accepted relationship leaves separately held membership and independently published titles unchanged; review those existing stores under their own erasure rules. Private evidence must be a reference URL rather than uploaded credentials or sensitive supporting documents.

Live MCP statistics retain anonymous daily stage/outcome counts, duration sum and maximum for 30 UTC dates. They contain no user, client, session, tool payload, raw URL or credential information and are restricted to administrators. The `mcp_live_statistics` table is explicitly excluded from immutable journaling and public replication. Bounded retention removes old dates; reads also filter the selected window. No identity lookup or per-subject erasure linkage is created. Apply the same 30-day cleanup before serving a restored backup. PIdP owns its equivalent OAuth statistics and releases that schema separately.

## Private portal account activity

`portal_account_activity` retains one latest verified portal request timestamp,
name and email per canonical account for 90 days, with five-minute update
throttling. It supports the administrator-only People account view. It contains
no login event history, credentials, sessions, IPs or provider payloads. It is
excluded from public replication and immutable history. Existing bounded cleanup
removes expired rows. Verified account erasure must delete the row by canonical
user ID; restores must reapply expiry and confirmed deletions, including backups
and administrative exports. Migration 0115 and activation remain pending;
no live collection or cleanup verification is claimed. See
[People directory](../PEOPLE_DIRECTORY.md).

### Private service correspondence

Service-desk tickets and messages expire 90 days after their latest activity.
The scheduled cleanup removes expired messages, tickets, and related service
notifications; organization administrators can delete a complete ticket earlier.
Only current owners and administrators of the ticket's organization can access
it. FAQ and routing settings persist until changed or the organization is retired.
No raw message, HTML, or attachments are retained. Service tables are excluded
from public replication and the immutable change journal. Copies in email
recipients' mailboxes and existing backups remain subject to their own retention.
Implementation and activation steps: [Service desk](../SERVICE_DESK.md).

## Member governance drafts

`governance_personal_drafts` holds the owner account ID, document ID, draft name,
current revision pointer and timestamps. `governance_personal_draft_revisions`
holds saved wording, the common base, save notes, content hashes and copied-source
references. These editorial drafts are visible only to active LifeTech members.
Do not put private health information, contact details or case reports in drafts.
The owner alone can save revisions. Explicit saves append snapshots; restores do
not rewrite history. Draft names are mutable metadata, not immutable content.

Review personal drafts 24 months after their last save (`updated_at`). This is an
operator review clock, not automated expiry. Ask whether continued retention is
needed; delete abandoned drafts unless a documented organizational/legal need
justifies retention and a dated follow-up review. Formal adoption records retain
their separate governance lifecycle. Personal draft history is not a permanent
formal adoption record.

For a verified owner deletion request or account erasure, an authorized operator
removes the owner's `governance_personal_drafts` rows in a bounded, scoped operation;
the foreign key cascades to all snapshots. Review copied-source references in
other members' drafts for residual personal information and handle corrections
through the privacy process. Deletion of the organization cascades to all drafts.
No automatic account-erasure integration or draft-deletion UI is claimed.

Both tables are excluded from the immutable change journal and public replicas.
Existing preview receipts retain their established lifecycle. Inventory these
private tables in backups and exports; apply confirmed erasures and overdue
retention reviews before serving restored copies. Erasure does not remove text
already copied into another member's independently saved wording or a formal
motion; review those shared records separately under the existing privacy policy.

Presentation applications also publish a nonmonetary `in_kind` organization-support
relationship from the applicant organization to the event host. This is a reported
proposal, not delivered service or confirmed acceptance. Its durable public evidence
contains organization names, event/submission IDs and the event URL, without submitter
identity, roster, title or summary. Resubmission reuses the same relationship; decline
or withdrawal voids it. Upcoming organization events include the relationship only
while its submitted or accepted application remains active and unexpired. The public
support evidence follows existing organization-support retention; application expiry
does not preserve the application contents in that evidence.

Anonymous presentation intake (`event_guest_presentations`) stores self-reported
contact name, email, teammate email, organization name and proposal for event-host managers only.
Anonymous submission grants no membership, organization ownership, public listing
or support relationship. After verifying the submitter email, explicit claim
confirmation creates a new owned team organization and a pending invitation for
the supplied teammate; it never claims an existing organization. Records expire 90 days after event end, stop serving immediately at
expiry, and the bounded hourly retention job removes them within 24 hours. Event
deletion cascades. Verified withdrawal/erasure requests through support delete the
matching private intake rows; reapply those erasures to restored backups before
serving. This store is excluded from immutable journals and public replication.
Submitting sends one transactional thank-you receipt with an optional account-claim
link, using the host organization's configured transactional sender. The form
explains this before submission. Delivery state records provider acceptance or an
unconfirmed send, never claimed inbox delivery. No historical applications are
emailed automatically and no newsletter consent is implied. Claiming requires
PIdP authentication with the same verified email as the submission and explicit
confirmation; no email alone grants access to an existing organization. Team invitations use
the existing seven-day invitation lifecycle and require recipient verification
and acceptance. The canonical claiming
account ID and claim timestamp share the application's original expiry. Claimed
applications are private to that account and event-host managers. Verified account
erasure must also delete anonymous intake rows by claimed_by_user_id and reapply
erasure after backup restoration. Send metadata expires and is deleted with the
application. Per-event and per-email intake limits retain no additional IP history.

Guest team setup retains the teammate email and references to the created team and
pending invitation with the application's original expiry. The teammate email must
be different from the submitter's address. Only the verified submitter can confirm
creation and invitation. The created organization, ownership and accepted
memberships follow the existing organization lifecycle; proposal expiry does not
delete that separately owned organization or accepted memberships. Invitation
expiry and recipient verification/acceptance use the existing seven-day invitation
workflow. Ambiguous invitation sends are not automatically duplicated.

### Organization membership requests

`organization_membership_requests` holds organization/account IDs and the
requester's display name for manager review. Requests expire after 30 days and
the bounded retention job deletes expired rows. Cancellation and manager decline
remove them immediately; organization deletion cascades. Approved members no
longer appear in the queue. Include this private store in account erasure by
`user_id`; exclude it from public replicas and immutable exports. Restore must
reapply expiry and verified erasures before serving requests. Production migration
0127 and scheduled cleanup remain unverified until deployment.
