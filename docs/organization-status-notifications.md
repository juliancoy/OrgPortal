# Organization status notifications

Organization membership inserts, role/status changes, and removals atomically
write a durable notification outbox through D1 triggers. Claims and ownership
transfers use those same membership writes. Unchanged profile/membership writes
produce no notice, and rolled-back transactions leave no notice. The migration
does not announce historical memberships.

Account preferences are available at `/settings/notifications` and through the
session-authenticated `/api/notifications/preferences` GET/PUT API. The account ID
and email come from PIdP authentication; payloads cannot specify another user or
address. All preferences default on. Email and organization-status push can be
controlled separately; account push also governs existing chat and timebank
Web Push delivery. Device registration and browser consent remain per device.
Existing event/organization mailing-list subscriptions remain separate opt-ins.

Preferences are applied when the change occurs and checked again before sending.
The minute cron drains the outbox. Status mail is enabled by default; operators
can pause it with `ORGANIZATION_STATUS_EMAIL_ENABLED=false`. Marketing campaign
sending remains controlled separately by `EMAIL_SENDING_ENABLED`.

Email reuses the existing approved Gmail sender, refresh-token encryption, sender
lease, rolling daily quota and provider adapter. Recipients come from the
notification preference address verified through authentication, or the same
account's PIdP-synchronized contact record. Membership payload email addresses
are never used for delivery. Provider-confirmed deliveries are not resent;
ambiguous submissions are marked uncertain and require checking Gmail Sent mail.
Missing sender configuration or addresses leave notices queued. Late email
opt-outs suppress queued messages.

Production email requires existing email integration setup: an OAuth client with
`EMAIL_GOOGLE_CLIENT_ID`, `EMAIL_GOOGLE_CLIENT_SECRET`, and a registered HTTPS
`EMAIL_GOOGLE_REDIRECT_URI` ending in `/api/email/google/callback`; an encryption
key `EMAIL_TOKEN_ENCRYPTION_KEY`; an explicitly approved `EMAIL_ALLOWED_SENDERS`
address; and the sender's Gmail send consent through the established email
connection flow. The notification settings page reports when delivery awaits
setup. It does not claim an enabled preference means a configured sender.

Push reuses the existing push queue, subscriptions, VAPID keys and service worker.
Stable notification IDs deduplicate queue retries. Delivery checks both account
and category preferences, including opt-outs after a job entered the queue.
