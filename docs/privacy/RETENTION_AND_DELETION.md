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

Visitor reporting uses Cloudflare Web Analytics aggregates, separate from account,
membership and audit activity. OrgPortal retrieves daily hostname totals and
popular page paths for administrators without storing a separate visitor history,
visitor identifiers, or analytics backups. Cloudflare manages collection and
retention; see [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/).

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
