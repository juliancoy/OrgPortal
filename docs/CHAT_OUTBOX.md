# Browser chat queue

Messages queued with Send deliver automatically once every member is ready for
the selected encryption level. No separate chat-request or security-acceptance
button is required. Queued messages remain bound to their original mode; changing
to another mode never silently downgrades them. Cancel removes an unsent message;
Retry preserves its stable client message ID, avoiding duplicate delivery.

Delivery runs in order while that chat is open. Returning to the chat or reloading
restores its queue. Closing the site suspends delivery. API authorization and the
complete live device roster are still checked immediately before every send.

The origin-local `orgportal-chat-outbox-v1` IndexedDB database stores account ID,
conversation ID, selected mode, creation time, stable client ID and ciphertext.
Bodies are encrypted to this browser's own RSA + ML-KEM keys, even for blue chats.
Authenticated encryption binds their metadata. On delivery, messages are encrypted
for the complete live recipient roster. The server receives no pending bodies.
Other accounts and conversations cannot load or send these messages. Existing
browser-key trust limitations, including device compromise and XSS, still apply.

Records expire after seven days. Retrieval hides and deletes expired records;
expired messages cannot be delivered. Confirmation, Cancel and Forget browser
keys delete local queue records. Sign-out retains the encrypted queue for the same
account; another account cannot resume it. Clear site data or forget keys when
closing an account. Browser/OS backups require device-owner deletion. Pending
messages never enter server backups, public replication or immutable journals.

The isolated Docker fixture uses real components/crypto and synthetic identity,
checks reload recovery, multiple pending messages, cancellation, ordered delivery,
no downgrade, autosave retries and responsive light/dark layouts. Artifacts are
local under `artifacts/layout-review/chat-encryption/`.

## Schema history

Migration 0006 added `accepted_security_revision` to conversation memberships
before the interaction preference was clarified. The deployed queue does not read,
write or enforce it. It remains an unused additive field; no messages, membership
roles or identity records were changed. Its lifecycle follows membership deletion
and backups. Do not drop memberships to remove this field. No database migration
or chat-server release is needed for the browser queue.
