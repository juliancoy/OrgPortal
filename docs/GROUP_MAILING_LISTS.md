# Group mailing lists

Owners and active organizers open **Mailing list** in their group dashboard's
Organizer view. Membership and email subscription are independent. Members and
visitors never receive subscriber data; signed-in people can change only their
own group announcement preference. Group domains and platform admin flags grant
no mailing-list access. Every private endpoint checks the current group's live
membership role. Sender ownership additionally protects connected Gmail credentials
and personal campaign drafts/history. Other organizers do not inherit a sender's
connection or campaign delivery addresses.

Subscriber pages include status, consent source, recorded consent date and
unsubscribe date. Older consent dates are shown as unknown rather than invented.
Organizers can suppress subscriptions, but cannot opt another person back in.
Subscribers themselves opt in using group email preferences or registration.
Membership creation never creates a subscription. Event updates remain a separate
subscription; cancellation suppresses only that event's updates.

Segments contain only opted-in subscribers from one group. Creating a segment
rejects cross-group or unsubscribed IDs. Campaign creation rechecks the audience;
saved segments exclude people who have since unsubscribed. General announcements
can be composed without an event. Event campaigns must reference an event hosted
by that group. Sending requires an explicit confirmation of a preview issued to
the sender within ten minutes; the receipt is consumed once. A changed audience
invalidates the preview. The durable outbox checks consent and active organizer
membership again at delivery. Losing organizer access pauses campaigns and skips
pending deliveries, including tests. Restored access does not resurrect skipped
recipients; create and preview a fresh campaign.

Subscriber/audience reads, segment changes, suppression, campaign previews and
send requests are audited without email addresses, message contents or recipient
selections. `EMAIL_EXPORTS_ENABLED` defaults off. When explicitly enabled by the
operator, CSV exports require the same group role, are audited, and escape formula
prefixes. Exports are capped at 10,000 records; campaign audiences at 1,000.
The UI exposes exports only when the API confirms they are enabled.

Sending still requires approved Gmail sender setup, configured encryption and
unsubscribe secrets, a postal address, and `EMAIL_SENDING_ENABLED=true`. This
feature does not enable sending, connect Google accounts, or send a campaign by
itself. Group organizers authorize their own delegated Google sender connection on the
registered callback host. Branded sites link there for setup; the browser-bound
callback retains the selected group and rechecks organizer access.

## Storage, retention and deletion

Migration `0084_group_mailing_lists.sql` adds consent timestamps to subscriptions
and creates private segments, minimal audit rows and temporary preview receipts.
The existing consent journal includes the added timestamps. These new private
stores are explicitly excluded from immutable journals and public replication.
Segments and audit records expire one year after creation; receipts expire after
ten minutes. Reads omit expired segments/audits immediately, and existing bounded
retention cleanup removes expired records within the policy's 24-hour target.
Subscription suppression remains while needed to prevent unwanted sending;
account erasure and older email campaign/journal copies remain subject to the
manual deletion process in `docs/privacy/OPERATIONS.md`.

For a verified deletion request, remove matching selections from segment JSON,
delete empty segments, remove the account's preview receipts, and delete or
minimize actor identifiers in audit rows. Handle subscription suppression,
campaign/delivery records and delegated sender revocation together; never infer
identity ownership from an email match. Backup/export and provider copies follow
the same operations runbook; erasing a subscriber does not erase messages already
received in Gmail or files already exported.
