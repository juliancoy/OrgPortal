# LifeTech service desk

`service@lifetech.fyi` is a Cloudflare Email Routing alias for the ChatGPT service
account. Until the ticket-capable OrgPortal release is live, it forwards to the
owner's verified Gmail address. The service account's original address remains
`chatgpt@lifetech.fyi`; creating an alias does not change identity or grant roles.

## Mail processing

After activation, the Cloudflare rule sends this one address to the existing
`org-codecollective` Worker `email()` handler. Other addresses remain unchanged.
The handler parses MIME with postal-mime, accepts at most 256 KiB, discards
attachments and HTML, and stores at most 50,000 characters of plain text. A
message without plain text requires admin review. No public mail-ingestion HTTP
endpoint, external LLM, or autonomous privileged tool execution is introduced.

Each accepted email creates a private ticket. A repeated Message-ID from the
same sender/address is idempotent. A reply with `[LT-<ticket id>]` reopens that
sender's existing ticket. The envelope sender is an untrusted contact address,
not proof of account ownership; support emails cannot authorize account changes
or retrieve private records. Automated/list mail never receives an automatic
answer. The handler avoids replying to its own address and common bounce senders.
A sender is limited to 30 accepted messages per hour.

Automatic answers require an exact normalized match to an enabled FAQ question,
with no attachment, additional question, sensitive category, or prior ticket
thread. The two initial answers point to the current bylaws and availability
pages; admins can manage answers and source links at `/support`. An unknown
question remains open. Native `message.reply()` additionally enforces Cloudflare's
DMARC and reply-loop checks. If automatic delivery fails, the ticket remains open
and notifies admins; an uncertain send is not automatically retried.

## Routing and access

Categories are general, membership, technical, privacy, and security. Active
organization owners/administrators can assign each category to a current admin.
If the assignee loses that role, notifications fall back to all active admins of
that organization. Notification text contains no sender address or message body.
The normal OrgPortal bell links to the private ticket. Queue, details, settings,
assignment, deletion, and replies all recheck live organization permissions.
Ordinary members, the ChatGPT contributor account, other organizations, and
anonymous visitors cannot read or manage tickets.

Admins review a reply in the UI before explicitly sending it. Each composed
reply carries an idempotency key, preventing a repeated request from sending the
same reply twice. Replies are sent
using the `SUPPORT_EMAIL` binding, restricted to `service@lifetech.fyi`. Email
Sending is enabled for the LifeTech domain. A failed or uncertain send stays
visible for manual investigation. Do not retry an uncertain send without checking
for prior delivery. The UI does not claim mailbox delivery merely because the
provider accepted a send.

## Retention and deletion

Tickets and correspondence expire 90 days after the latest inbound message or
admin action. The scheduled retention job deletes expired messages, tickets, and
related support notifications in bounded batches. An organization admin can
permanently delete a ticket and its correspondence sooner. Removing an
organization cascades its support records, and ticket deletion removes associated
service notifications. FAQ answers and routing
configuration persist until changed or the organization is retired. These private
tables are explicitly excluded from public replication and the immutable
change journal; they are not added to public organization snapshots. The system
does not preserve raw email or attachments. Recipient mailbox copies, the current
Gmail forwarding destination, and existing backups have separate retention.

## Activation and release

1. Review and apply `org-worker/migrations/0116_support_tickets.sql` and
   `org-worker/migrations/0117_support_controls.sql` using
   the established remote migration path; they create the private support tables and
   their journal exclusions without changing existing identities or permissions.
2. Add `SUPPORT_EMAIL` to live Worker settings as a `send_email` binding restricted
   to `service@lifetech.fyi`. Code releases inherit live bindings; the checked-in
   Wrangler binding alone does not update an existing production Worker.
3. Release API and frontend through `scripts/release.mjs` from clean current main
   and verify both public commit health endpoints. There is no migration during
   ordinary release and no deployment through CodeCollective.
4. In `/support`, select LifeTech and use **Enable email processing**. The
   setting defaults to off and requires an active organization owner/admin and
   the sending binding. Disabling blocks incoming processing and manual sends,
   while preserving existing tickets; in-flight work may finish. Incoming mail
   routed to the disabled Worker is explicitly rejected, never silently dropped.
5. Change only the existing exact-address service alias action from owner Gmail
   forwarding to Worker `org-codecollective`, preserving all other rules.
6. Verify a known FAQ answer and an unknown-question ticket through the real
   Cloudflare email path. Use owned addresses; tests must not send to strangers.

Local tests must use isolated writable Docker with replication off. Never seed
fixture identities, ticket bodies, or permissions into a production database.

## Current implementation handoff

The console control and activation migration are prepared in source. No new
migration has been applied remotely and this implementation has not been released.
The next activation step is review of migrations 0116 and 0117, followed by focused
validation when requested. Keep Gmail forwarding in place until the candidate has
passed validation and the owning release workflow has completed. The console
reports application enablement and binding presence, not verified mail delivery
or Cloudflare routing. No Cloudflare API credential is exposed to the browser.
