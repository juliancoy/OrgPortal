# Chat encryption candidate

Local implementation; additive migration `chat-worker/migrations/0005_chat_encryption.sql`
requires explicit schema review before deployment. No production migration or
release is included. The custom envelope protocol is experimental and has not
received independent cryptographic review. Do not describe it as quantum proof.

Administrators select the protection for **new messages** in Chat protection.
Blue means no end-to-end encryption (HTTPS remains); green means RSA-3072;
purple means RSA-3072 plus ML-KEM-768, the standardized Kyber successor.
Labels accompany color. Each message keeps its own protection indicator;
changing policy does not encrypt existing history. Calls, reactions, attachments,
membership, timestamps and other metadata are outside this content encryption.

## Protocol and trust

`shared/chatEncryption.ts` defines version 1. The browser creates a random
256-bit content key and encrypts UTF-8 text with AES-256-GCM. For each registered
recipient device it encrypts a fresh 32-byte secret with RSA-OAEP/SHA-256. In
hybrid mode it also encapsulates to ML-KEM-768 through pinned `mlkem-wasm@0.0.7`.
HKDF-SHA-256 combines both secrets (RSA only in green mode) into an AES wrapping
key. Each recipient gets a separately nonced AES-GCM content-key wrap. AES-GCM
nonces are random 96-bit values; tags are 128 bits. Cleartext is never submitted
on the encrypted send path or persisted in the chat database. JavaScript and
WebCrypto necessarily allocate/copy buffers; this browser implementation makes
no zero-copy guarantee. Temporary accessible secret byte arrays are overwritten
where possible, without claiming guaranteed erasure from browser memory.

Authenticated data binds protocol version/domain, mode, policy revision, room,
client message ID, sender account/device and sorted recipient-device identities.
Recipient wraps bind that context and their own recipient identity. The API
checks current membership, authoritative administrator roles, mode, revision,
sender and the complete current device roster. A conditional SQL insertion and
revision triggers reject same-database membership/device/policy races. Live
organization checks use a separate D1 binding; there is no cross-database atomic
transaction. Clients reject changed context and authenticated-decryption failures.

Trust still rests on authenticated service sessions, delivered browser code and
the service's public-key directory. There are no independent key verification,
transparency proofs, message signatures, ratchets, forward secrecy, recovery,
cross-device key transfer or independent cryptographic audit. A malicious service
or compromised browser can defeat this trust model. Recipients can copy content.
Quantum-resistant key establishment does not make the whole system quantum proof.
Review the protocol, implementation and dependency provenance before production use.

## Membership and keys

DM owner/admin roles may change policy. Organization rooms check live organization
management roles. Event rooms check the actual event host or host organization's
management; the first commenter's stored room-owner role grants no such authority.
Public event rooms remain joinable by signed-in commenters; encryption does not
make their membership private or restrict who can join.

Every active member must register a device before encrypted sending succeeds.
Other browsers must open the chat to register their own keys. Each message wraps
to all registered active devices (maximum 8 per account and 256 per chat).
New browsers and new members cannot decrypt earlier messages. Removed/expired
devices do not receive new wraps; existing copies remain decryptable by their
original recipients. Anonymous event reads exclude encrypted messages and their
recipient metadata. Legacy clients cannot submit cleartext into encrypted rooms.
An older API version does not enforce the new policy: after enabling encryption,
rollback must preserve this server enforcement or disable message writes.

Private keys remain in origin-scoped IndexedDB: nonextractable RSA CryptoKey and
the ML-KEM private seed (WASM keys cannot be structured-cloned). Local browser
storage/XSS compromise can expose keys or plaintext. Forget browser keys removes
that browser's durable key and public registration, without erasing recipients'
copies. Other open tabs can register a new device; close them when forgetting.
Browser keys survive sign-out for the same account's history, are separated by
immutable account ID, and are removed by browser-site-data deletion or the
explicit forget control. The service cannot recover them.

## Validation and release

Focused crypto tests exercise both real encryption modes, both recipients,
context/content/KEM tampering, account separation and durable browser keys.
Real SQLite API tests exercise migration compatibility, authorization, tenant
isolation, device expiry/deletion, missing recipients, cleartext denial, stale
policy and a membership race during insert. The isolated Docker browser fixture
uses real components/crypto with synthetic identity and intercepted APIs, checks
all three colors, encrypted transport/decryption, autosave failures and edits
during saves, member controls and missing-member sending. Screenshots are local
artifacts under `artifacts/layout-review/chat-encryption/`.

Before release: review the migration and cryptography, include current chat-worker
enforcement in every serving API version, follow the normal release workflow,
and validate key storage/WASM on each supported browser. Local Chromium acceptance
does not establish Safari/Firefox support or an independent security audit.
