# Organization service email

Every OrgPortal organization can use the service desk at `/support`. Active
members with a verified account email can compose messages and reply to their own
correspondence. Email verification comes from the authenticated PIdP identity's
`identity_data.email_verified === true`, never from a user-entered address or an
incoming email. Each message has one recipient and an explicit review/send step.
Organization owners and administrators manage activation, FAQs, assignments, and
the complete queue. They also need a verified email to send messages.

## Mailboxes and branding

`org-worker/src/supportMailboxes.ts` resolves mailboxes and organization branding.
On first access, each organization receives a stable random
`service+<32-character identifier>@notify.orgportal.cc` reply address stored in the private
`support_mailboxes` table. Shared outbound mail uses `service@notify.orgportal.cc` with
the organization's name and its own reply address. LifeTech uses
`admin@lifetech.fyi` for outbound mail and replies. The stable stored
`service@lifetech.fyi` address remains an inbound alias; existing forwarding rules
are preserved unless separately changed. The admin address routes directly to the
primary Worker and appears in the LifeTech `/support` inbox. Changing an organization's slug does not change
its mailbox. New organizations receive the same capability without code changes.

The service page defaults to the current group site's organization when the user
is a member, preserves manual selections, and displays the mailbox returned by
the API. Members see their own authored conversations; administrators see the
organization queue. Membership and access are checked on every request.

`supportEmailTemplate.ts` renders HTML and plain text with the organization name,
optional HTTPS image, greeting, service signature, reference, and reply guidance.
FAQ replies identify themselves as automatic. Human emails carry no automation
notice. Incoming Message-IDs are retained for reply threading. API acceptance is
reported as sent, not proof of mailbox delivery. Failed or uncertain sends remain
visible and must not be retried without checking delivery. Request IDs prevent
repeated sends, and sending is limited to 30 messages per member per hour.

## Incoming mail

Cloudflare routes configured service addresses to the primary `org-codecollective`
Worker `email()` handler. Unknown addresses, disabled organizations, and replica
workers reject incoming messages. Processing defaults to off. Other mail routes
must remain unchanged. Mail from outside the organization can open a support
ticket; its envelope sender is an untrusted contact address and grants no account
or organization permission.

The handler accepts at most 256 KiB, discards attachments, sanitizes the HTML alternative, and stores at
most 50,000 characters of plain text. Messages retain a plain-text fallback and, where present, sanitized HTML.
Scripts, forms, frames, event handlers and external-resource CSS are removed.
Formatted messages render in a sandboxed, opaque-origin frame with a restrictive
CSP; only organization-hosted images load. Plain text remains available. Repeated Message-IDs are idempotent. Replies with the ticket reference
reopen the same sender's ticket in the same organization. Automated/list mail and
bounce senders receive no automatic answer. Inbound acceptance is limited to 30
messages per sender, per organization, per hour.

Automatic answers require an exact normalized match to an enabled FAQ with no
attachment, sensitive category, or existing conversation. Native `message.reply()`
adds Cloudflare's reply-loop and DMARC checks. No external LLM or autonomous
privileged actions are involved.

## Activation and release

1. Apply pending migrations through the established owning release workflow.
   `0120_support_mailbox_identity.sql` fills missing LifeTech defaults without
   replacing existing answers. `0121_organization_service_email.sql` creates the
   private mailbox mapping and adds conversation authorship and Message-ID fields.
2. Reuse the existing `notify.orgportal.cc` and `lifetech.fyi` Email Sending
   domains. Configure the live
   `SUPPORT_EMAIL` binding to permit `service@notify.orgportal.cc` and
   `service@lifetech.fyi`. Checked-in configuration does not update live bindings.
3. Release API and frontend through the owning release workflow when requested.
4. An organization owner/admin enables processing at `/support`.
5. Route the generated organization service addresses to `org-codecollective`.
   Use exact-address rules, or an approved catch-all only on a domain dedicated
   to this service. Do not replace an existing domain catch-all or unrelated rules.
   Keep LifeTech forwarding until its processing and release are ready.
6. When requested, verify actual sending and receiving using owned addresses.

The console reports binding presence and application activation. It cannot verify
Cloudflare routing, current domain status, or final delivery. No mail is sent merely
by applying a migration or visiting the page. This source change does not enable
any organization, apply remote migrations, change routing, or deploy.

## Privacy and retention

Tickets, correspondence, and notifications expire after 90 days without activity.
Admins can delete tickets sooner; organization deletion cascades to its service
records and mailbox mapping. FAQs, routing, activation, and mailbox configuration
persist until changed or the organization is removed. These private tables are
excluded from public replication and the immutable public change journal.
Notification text omits sender addresses and bodies. The system retains neither
raw MIME nor attachments. Recipient copies and backups have separate retention.

## Combined correspondence

All mail is the default view. Sent support mail, received mail and automatic
answers share chronological conversation histories. Lists and message histories
provide pagination; older retained records are accessible instead of silently
stopping at 100 conversations or 200 messages.

Operator-configured native invitations are archived in the uniquely resolved
sender inbox, retaining delivery status and provider Message-ID where available.
The cron backfills retained prior delivery outcomes idempotently without sending.
The private invitation archival receipt prevents deleted conversations from being
recreated by later backfill. Apply the reviewed additive migration
`0128_invitation_correspondence.sql` before releasing this change.
Historical reconstructed invitations are explicitly labeled; unavailable original
MIME headers are not invented. Replies thread by ticket reference, matching
Message-ID, or a unique reply subject within the same organization and sender.
No personal Gmail inbox is imported. Existing access checks and 90-day inactivity
retention continue to apply to all correspondence.

Apply the reviewed additive migration `0129_support_message_html.sql` before
releasing formatted message support. The HTML field shares its parent ticket's
existing 90-day inactivity retention, deletion, erasure and replication exclusions.
Previously discarded HTML cannot be recovered from the plain-text record; retain
old messages as-is and add corrected copies to their existing conversation.
