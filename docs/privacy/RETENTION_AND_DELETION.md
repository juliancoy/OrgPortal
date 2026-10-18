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
