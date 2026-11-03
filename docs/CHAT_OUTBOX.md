# Chat queue and acceptance

Candidate, November 2, 2026. Queuing explicitly authorizes automatic delivery
when all required acknowledgments and browser keys are ready. Messages remain
bound to the chosen mode; changing to another mode never downgrades a queued
message. Cancel and retry controls operate on the same stable client message ID.
Delivery runs in order while that chat is open. Reloading or returning to the
chat restores its queue. Closing the site suspends delivery.

The origin-local `orgportal-chat-outbox-v1` IndexedDB database stores account ID,
conversation ID, selected mode, creation time, stable client ID and a ciphertext
recipient envelope. Bodies are encrypted to this browser's own RSA + ML-KEM keys,
including when the destination chat is blue. Authenticated encryption binds the
metadata. They are re-encrypted for the complete live device roster on delivery.
The server receives no pending bodies. Other accounts and conversations cannot
load or send these messages. Browser keys remain subject to the existing chat
key trust limitations, including XSS and device compromise.

Records expire after seven days. Retrieval hides and deletes expired records;
expired messages cannot be delivered. Confirmation or Cancel deletes the local
record. Forget browser keys clears that account's queue before deleting keys.
Sign-out retains the encrypted queue for that same account; signing in as another
account cannot resume it. Clear site data or clear the account queue when closing
an account. Browser/OS backups require device-owner deletion; these records never
enter server backups, organization replication or immutable journals.

## Explicit migration review: 0006

`chat-worker/migrations/0006_chat_acceptance.sql` adds one integer field to each
existing conversation membership. It stores the exact accepted security revision,
with -1 meaning not accepted. No messages, keys, memberships, roles or identities
are deleted or rewritten. Acceptance is scoped to the authenticated active member;
stale security submissions fail. DM sending requires all active members to accept
the request and current revision. Device, membership and security changes already
advance the revision, requiring renewed acceptance. Group/event chat permissions
remain unchanged. The conditional message INSERT rechecks acceptance and revision
atomically, including a tested acceptance race.

The new field shares membership retention and deletion; it creates no separate
server history. D1 backups containing memberships include this field and follow
membership backup/verified-erasure handling. Schema rollback is unnecessary and
must not drop memberships. After enforcing acceptance, rolling back to a chat
Worker that ignores it would bypass consent: preserve enforcement or stop writes.

Apply 0006 separately from ordinary releases after this review. The normal release
now checks/types/builds chat, preserves its live bindings and Durable Object class,
and refuses deployment unless the new field exists. Frontend deploys before chat:
the new queue fails closed against an older chat API that lacks acknowledgment
state. Existing clients must refresh to accept requests. Test artifacts are local
under `artifacts/layout-review/chat-encryption/`; no production sign-in is used.
