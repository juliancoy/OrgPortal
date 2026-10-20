# Google Workspace email campaigns

OrgPortal now has an organizer-only `/email` screen for event campaigns and an authenticated `/email/preferences` screen for subscribers. This change builds on the event-registration work and its `0018_event_registrations.sql` migration.

## What is implemented

- Connect the administrator's allowlisted Google account with OAuth, browser-bound single-use state, PKCE, verified Google ID tokens, and encrypted refresh tokens. Campaigns and Google credentials are owned by the connecting PIdP user ID. Other administrators cannot access or send that owner's campaigns.
- Choose an organization-hosted event and send to its event-update subscribers, organization-announcement subscribers, or selected announcement subscribers. Every campaign snapshots its recipients; changing or adding subscriptions does not silently expand an approved audience.
- Compose plain text with `{{first_name}}`, `{{event_title}}`, and `{{organization}}`. The HTML/plain-text template includes the organization name, event image, title, date, location, registration link, sender mailing address, and unsubscribe link. Dates are explicitly labeled Eastern time. The template escapes supplied content; custom HTML is not accepted.
- Save immutable drafts, preview the message and recipient list, queue a required self-test and optional additional review copies, send or schedule, pause/resume, and inspect per-recipient status. Editing the composer and saving again creates a new draft. Previews are fingerprinted; audience changes require a refreshed preview before queueing.
- Persist an outbox in D1 and drain it from the existing minute cron. There is no additional Cloudflare Queue binding. Delivery checks current subscription status, enforces a rolling sender allowance, serializes concurrent cron invocations with a lease, and processes at most ten messages per sender per invocation within a bounded runtime.
- Keep event updates and organization announcements separate. Organization announcements start unchecked on registration; event updates have their own visible checkbox. Cancelling a registration stops event-update emails without unsubscribing from organization announcements. Subscription changes do not cancel event registration.
- Provide a signed unsubscribe URL that works without login. GET displays a confirmation form; POST performs the unsubscribe and supports Gmail's one-click unsubscribe header format. This prevents link-preview GET requests from unsubscribing people.

The new registration form captures choices prospectively. Existing users, contact profiles, old registrations, organization members, and scraped contacts are **not automatically subscribed**. No historical email addresses are backfilled into a marketing audience. The event-list quick attendance action does not collect email consent; direct visitors to the event detail registration form to opt in.

## Google setup

1. Use a Google Cloud project under the Code Collective Workspace organization. Enable the Gmail API and create a **Web application** OAuth client for the portal sender connection. You may extend the existing Google Web application client by adding the email callback and Gmail send scope; retain every existing callback. A dedicated client is also supported. No PIdP source modification or Workspace domain-wide delegation is required.
2. Configure the consent screen for the intended audience. For a connection limited to Code Collective Workspace accounts, use an internal audience where the Google Cloud organization permits it. If publishing externally, resolve Google's sensitive-scope verification requirements before relying on it in production. Avoid leaving a production background sender in an expiring external testing configuration.
3. Authorize the exact callback URL served through the same origin as the portal. On OrgPortal this is `https://orgportal.cc/api/org/api/email/google/callback`. If a different host serves the portal, use that same host for the callback and configure it consistently in Google and the worker. The browser-binding cookie is host-only.
4. Request `openid`, `email`, and `https://www.googleapis.com/auth/gmail.send`. Delivery-failure monitoring is optional and adds `gmail.readonly` only when explicitly selected. Gmail draft-management permission is not requested. The connected Google email must equal the allowlisted, signed-in administrator's account email.
5. Ensure PIdP identifies Julian as an existing portal administrator. Do not grant campaign access based only on a browser-supplied email address. The worker uses the established administrator check and verifies Google identity independently.

References: [Google server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [sending messages](https://developers.google.com/workspace/gmail/api/guides/sending), [sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace).

## Configuration

Store secrets with `wrangler secret put NAME` from `org-worker`. Do not paste real values into source control or this guide. `.dev.vars.example` documents local-only configuration, and real `.dev.vars` files are ignored by Git.

| Setting | Value or purpose |
| --- | --- |
| `EMAIL_GOOGLE_CLIENT_ID` | Google Web application client ID. |
| `EMAIL_GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `EMAIL_GOOGLE_REDIRECT_URI` | Exact HTTPS callback described above. |
| `EMAIL_TOKEN_ENCRYPTION_KEY` | Base64 of 32 cryptographically random bytes. AES-GCM encryption binds tokens to their owner and email. |
| `EMAIL_UNSUBSCRIBE_SECRET` | Separate high-entropy signing secret of at least 32 characters. |
| `EMAIL_ALLOWED_SENDERS` | Defaults to `julian@codecollective.us`. Comma-separated allowlist; each sender must connect their own account. |
| `EMAIL_POSTAL_ADDRESS` | The real sender mailing address to display in every email footer. |
| `EMAIL_DAILY_LIMIT` | Defaults to 250 portal submissions per rolling 24 hours; hard-capped at 1,500 in code. This is a local allowance, not a report of Google's remaining quota. |
| `EMAIL_SENDING_ENABLED` | Defaults to `false`. Set to `true` only after setup is complete and Julian is ready to use the sending controls. |
| `PUBLIC_PORTAL_BASE_URL` | Existing setting. For the current deployment, `https://orgportal.cc`; email buttons link to this base plus `/events/:slug`. |

Generate the encryption and unsubscribe secrets independently. Preserve the encryption key to keep existing connections usable, and preserve the unsubscribe secret so old unsubscribe links remain valid. Rotating either requires a planned migration, not simply replacing its value.

The OrgPortal frontend Worker forwards `/api/org/*` to the deployed org Worker, including Authorization, Cookie, Set-Cookie, request bodies, and redirects. Both the callback and the public unsubscribe endpoint must reach the org Worker without a portal login redirect. Use a Workers/D1 plan that supports the application's existing workload and the outbox's bounded queries.

## Rollout

1. Merge the prerequisite registration change before this feature, or deploy a source version containing both.
2. Install dependencies and run the checks below. Review pending migrations, then apply them with `npm run db:migrate:remote` from `org-worker`. Migration `0019_email_campaigns.sql` is additive; it creates sender, consent, campaign, delivery, OAuth-state, and send-attempt tables.
3. Configure Google and worker settings. Keep sending disabled during setup. Deploy the org worker and the web frontend using their existing production pipelines. Preserve the existing cron and push/UBI bindings.
4. Julian signs in as administrator, opens **Email campaigns**, and chooses **Connect Google Workspace** to consent as `julian@codecollective.us`. Credentials must never be collected through chat or committed to GitHub.
5. Complete any desired validation with the sending gate still disabled. Enable mass sending only when ready. With the gate still disabled, Julian can choose **Send test to myself** in the portal and inspect the result after the next minute. Do not automatically send a test or campaign merely because this deployment guide exists.

## Delivery behavior and recovery

- Gmail-accepted messages are labeled **sent**, not delivered. Open/click estimates and campaign-link opt-outs are measured for portal sends. Bounce monitoring is optional and requires the additional read permission described below. Reply tracking is not implemented.
- The local allowance counts all submissions, including tests and rejected attempts. Normal use of Julian's mailbox also consumes Google's quota but is not visible to this send-only integration. A definitive Google rate-limit response defers sending for an hour, with bounded retries.
- Network failures, timeouts, server errors, and crashes after a sending claim become **uncertain**. They are never blindly retried. Check Gmail Sent mail before intentionally creating a replacement campaign for affected recipients. A Message-ID aids inspection but is not treated as a Gmail idempotency guarantee.
- Pausing or disconnecting stops future submissions; a submission already in flight can finish. Disconnect removes the local refresh token and pauses queued campaigns. Reconnect and explicitly resume when ready. A reconnect does not resend failed or uncertain deliveries.
- The outbox rechecks unsubscribe status just before sending, although an unsubscribe cannot recall an email already in flight. There is no admin control to silently re-subscribe a recipient.
- Subscriber campaigns are limited to 1,000 recipients per draft; one-time outreach is limited to 500. Test sends are limited to 20 per sender per rolling day and one pending test per campaign.
- Scheduled campaigns run on or after their chosen time, subject to the minute cron, quota, pause state, and connection health. This is not an exact-second scheduler.
- Event campaigns and reviewed one-time outreach use the workflow below. Automatic registration-confirmation/reminder rules and external email-provider delivery adapters are future extensions.

## Checks

```sh
cd org-worker
npm ci
npm run typecheck
npm test
npm run check:bundle
cd ../web
npm ci
npm test -- src/ui/views/email/emailApi.test.ts src/ui/views/public/attendanceApi.test.ts
node --test tests/unit/org-proxy.test.mjs
npm run build
```

The backend tests use a real in-memory SQLite database with all migrations and mocked Google/identity responses. They exercise OAuth state binding and replay prevention, token encryption, admin and sender ownership, distinct consent, signed unsubscribe, stale previews, concurrent dispatch, quota, scheduling, pause/resume, and uncertain-result handling. They do not send real email.

For rollback, first disable email sending, then roll back application code as needed. Preserve the additive tables, sender encryption key, unsubscribe signing secret, and existing unsubscribe endpoint so recorded consent and old unsubscribe links remain usable.


## Setup status

`GET /api/email/sender` returns `setup_issues` with missing or invalid setting
labels, never credential values. The organizer screen displays these issues.
Administrator privileges do not configure the Google Cloud OAuth application or
Worker secrets. Complete the settings above before connecting a sender. The
production frontend and API deploy independently from CodeCollective through
`scripts/release.mjs`; see [release operations](RELEASE.md).


`EMAIL_SENDER_ALIASES` optionally maps verified account emails to Workspace send-as
aliases, for example `{"julian@codecollective.us":"events@codecollective.us"}`.
Configure the alias in Gmail before sending. Google consent and stored credential
ownership remain attached to the primary account. The sender panel and campaign
preview display the effective From address, and MIME From/Reply-To use that alias.


## Required self-preview

Every immutable campaign draft must first send a test to its connected account's
primary email. Only a test marked sent (accepted by Gmail) unlocks sending,
scheduling, or resuming that same campaign. Queued, failed, and uncertain tests
do not qualify. The UI asks the organizer to inspect their inbox before final
confirmation. New drafts require new tests; another campaign's test never counts.
The backend enforces this requirement and pauses queued campaigns without a
successful self-test. Gmail acceptance does not prove inbox delivery or reading.

## Individual test opt-out links through MCP

`prepare_email_contact_link` accepts `organizationId` and the exact recipient
`email`. It requires both portal scopes and active owner/administrator membership
in that group, including for operator accounts. It returns an individual signed
unsubscribe URL and current opt-out status; it never subscribes, unsubscribes,
queues or sends a message. Preparing the link records the existing minimal audit
event. Use the returned URL only for that recipient, including when sending a
test to a different address from the connected Google account. Do not copy the
primary account's preview link into another recipient's test.

## Outreach and campaign reports

On `/email`, choose a group and open **Prepare a one-time outreach campaign**.
Import CSV columns `email,name,source_url,source_checked_at`, review the source
links, and explicitly approve the one-time audience. Duplicates and malformed
addresses are removed. Missing/stale evidence, specialist addresses and unresolved
mail routing remain held. Organizers can document verified review decisions;
current opt-outs and known permanent failures are never overridden by imports.
Contacts are not inserted into subscription lists.

The composer supports a brand color, logo, inline JPEG/PNG up to 300 KB, sender
name, mailing footer and RSVP button. Drafts use the existing individual MIME,
open/click measurement, private outbox, quota, role rechecks and uncertain-result
handling. A self-test to the connected primary account is required; optional
review copies become available afterward. Self-tests work while mass sending
is disabled. Sending still requires the operator's mass-send gate.

Outreach pauses at each 50-attempt boundary. Refresh the campaign, inspect its
recipient and delivery charts, then **Approve next batch of 50** using a fresh
one-use preview. Uncertain submissions pause sending and require a documented
Sent-mail/provider outcome; they are never requeued automatically.

**Campaign history → View analytics** shows the delivery pie and independent
opened/clicked/unsubscribed pies. These actions overlap; they are not slices of
one combined engagement pie. Unknown historic engagement is unavailable. JSON
completed-campaign imports are report-only and cannot send or create subscribers.
Their import key prevents duplicate histories; evidence and receipts remain
private to the connected campaign owner with current group organizer access.

Automatic bounce monitoring needs the visible **Read Gmail delivery failures**
option followed by Google reconnection, requesting `gmail.readonly` in addition
to `gmail.send`. Google may require Workspace administrator approval or OAuth
verification for that additional permission. Monitoring uses exact original
message-ID/recipient matches, not email-only attribution. A manual **Record
bounce** action supports reviewed provider notices, including historical mail.

Migration `0091_email_outreach.sql` is reviewed separately from release. It adds
campaign/delivery metadata, failure protection and temporary bounce receipts;
excludes future private campaign/sender journal copies without deleting old
history; and adds a per-campaign recipient uniqueness constraint. The unique index rejects preexisting duplicate recipients atomically instead of deleting or merging delivery history. No email is queued
or sent by the migration or a report import. See the privacy retention schedule.
