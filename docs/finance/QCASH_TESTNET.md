# QCash testnet alongside Dena

## QCash Beta release

The hosted test network is presented as **QCash Beta**. This is a beta release
label, not a new currency or a chain reset: `currency=QCash`, existing addresses,
encrypted backups, signatures and the pinned chain identity remain compatible.
The hosted chain retains its fixed 12-bit target (about 4096 classical hash
attempts per successful proof). The operator's miner waits 30 seconds between
blocks; that is local pacing, not a consensus-enforced block time. Other miners
can produce blocks faster. Low difficulty makes this suitable for functional
payment trials, not security or economic-value claims. Test coins have no stated
monetary value, confirmations are reversible, and future beta resets are possible.

The native gateway is authenticated and remains behind the HTTPS portal proxy.
The existing native peer is not opened to the public by this release. There are
no Dena conversions, deposits, purchases or implicit database migrations.

The finance overview includes a separate QCash Testnet card. The existing
`/send` and `/receive` pages offer Dena (`DEM`, the existing database
ledger) and experimental QCash Testnet (`QCash`, the separate native C++ chain).
The new adapter is disabled until both gateway URL and exact chain ID are
configured. There is no exchange rate or conversion between currencies. Existing
Dena links remain valid; unsupported/ambiguous currency requests fail closed.

## Wallet and UX

QCash signing uses the pinned `@noble/post-quantum` ML-DSA-65 implementation in the
browser. SHA3 addresses, canonical bytes and signatures interoperate with native
OpenSSL. It does not use ML-KEM as a signature algorithm. The browser creates or
unlocks an encrypted seed backup (PBKDF2-SHA256, fixed 600000 iterations, random
salt, AES-256-GCM). No seed, password or private signing key is sent to the portal,
gateway or node. The encrypted backup is a user-controlled downloaded file.

An unlocked wallet survives navigation between Send and Receive; it locks on
hiding/leaving the tab, after five minutes without input, or on explicit Lock.
Known buffers are cleared on lock; JavaScript cannot guarantee erasure of all
runtime copies. It is a development wallet, not independently audited custody.
There is no server-side recovery: losing the backup or password loses access.

QCash amounts are exact decimal strings of whole atomic units (`decimals=0`), never
JavaScript floating-point money. The Send flow reviews recipient, amount, fee,
total and network before explicit wallet authorization. Requests and QR codes bind
currency, chain ID, destination address and amount. Wrong-network requests cannot
be signed. Signed-in people can link a wallet with a one-use ML-DSA ownership proof and find
recipients by public profile name. See [profile-link protocol and migration review](QCASH_PROFILE_LINKS.md). Portal login
alone never authorizes spending blockchain funds.

On Send, paste a complete QCash payment link or choose **Scan QR image** to read a
saved PNG/JPEG/WebP QR image locally. This is image scanning, not a live camera
scanner. Images are limited to 5 MB and 16 megapixels; decoded links are never
opened or fetched. Wrong-network, ambiguous and invalid-amount requests leave
the payment fields unchanged. Importing details never authorizes payment.

After sending, a payment receipt shows the observed pending/confirmed status,
amount, fee, recipient and transaction ID. **Download payment receipt** saves a
public JSON snapshot, not proof of permanent settlement. Connection loss hides
the stale balance, marks receipt status unavailable and pauses sending until
reconnection. Receipts and polling state remain in memory for that page session;
downloaded copies are retained/deleted by the user, outside portal backups.

**Verify wallet recovery** checks that a chosen encrypted backup and password
recover the currently unlocked address without replacing the active wallet.
The temporary recovered key is cleared after the check. Wallet recovery still
requires keeping both the backup file and its password; portal login cannot
replace either. Verification is session-only, and hiding/reloading locks the
wallet as before.

Transfers expose addresses and amounts on the testnet. The wallet displays
spendable balances, immature mining rewards, pending/confirmed history and depth.
There is no finality guarantee: reorgs can remove confirmations and transactions.
Descriptions/encrypted payment-message envelopes are not included in QCash transfers
yet; Dena keeps its existing description flow.

## Node and adapter

`pqcoin-pow` now accepts signed transfers into an in-memory queue of at most 128,
with one pending transfer per sender. It validates current funds, signature,
nonce, chain binding and canonical encoding before accepting. Peers pull pending
transfers over existing hybrid TLS; miners include them in blocks. The development
continuous miner paces new blocks by configured spacing, independently of the
fixed-target consensus rule. Confirmed history is rebuilt from the durable journal;
reorgs rebuild the active index and requeue currently valid detached transfers.

Pending submissions are **volatile** across restart. Exact retransmission is
idempotent for both pending and active-chain-confirmed transfers. An uncertain
submission offers retry of the same signed bytes, not automatic re-signing with a
new nonce. A reorg may require the sender to resubmit additional transfers after
an earlier nonce confirms. There is no replacement-by-fee or pending nonce chain.

`pqcoin/tools/wallet_gateway.py` provides a bounded local HTTP adapter over the
native CLI/TLS client. It holds a node transport identity, not wallet spending keys.
It defaults to loopback, bounds body size, subprocess timeouts, HTTP connection
lifetimes and concurrent gateway handlers. It is not a production public gateway.
Pre-pin its native peer identity before connecting.

The Worker exposes `/api/pqcoin/network`, `/accounts/:address`,
`/transactions/:id`, and signed-only `POST /transactions`. It pins the configured
chain, validates/bounds responses, disables caching, rejects redirects and never
forwards PIdP credentials upstream. Broadcast authorization is the wallet signature;
a PIdP token or organization role grants no spending power. These proxy routes do
not write organization replica data. Ordinary organization/DEM replica writes
remain blocked by the existing primary-only policy.

## Try locally

1. Build the sibling native repository with `cmake --preset local` and
   `cmake --build --preset local --parallel 4` from `pqcoin/`.
2. In the local portal's Receive page select **QCash Testnet**, create a wallet,
   retain its encrypted backup/password and copy its public address. Wallet
   creation works while the gateway is unavailable; no balance is invented.
3. Run from the workspace root:

   ```bash
   python3 pqcoin/tools/run_portal_testnet.py --mine-to YOUR_PUBLIC_WALLET_ADDRESS
   ```

   For a Docker-based Worker, bind the gateway to the host's **private Docker
   bridge address** with `--host ADDRESS`, reachable from that container.
   `127.0.0.1` inside a container refers to that container, not the host.
4. Configure the local org Worker with the exact `QCASH_CHAIN_ID` and
   `QCASH_GATEWAY_URL` printed by the launcher, plus `ENV=development` for local
   HTTP. Use its local `.dev.vars` setup; do not publish secrets or modify
   production data. Restart only the local Worker to load the settings.
5. Unlock the saved backup in the portal. Mining rewards mature after two
   additional blocks. Create another wallet in a separate browser tab/context and
   use its Receive link or QR to send QCash. Hiding a wallet tab locks it.

No production configuration, deployment or D1 migration is performed by this
feature. Remote configuration requires an HTTPS gateway and the normal portal
release process. Defaults remain empty in `wrangler.jsonc`. Regenerate config
types with `wrangler types pqcoin-bindings.d.ts --env-interface
PqcoinRuntimeBindings --include-runtime false --strict-vars false`.

## Verification and retained data

Run focused browser crypto/payment tests, API adapter tests and type checks:

```bash
npm --prefix web test -- src/features/pqcoin/wallet.test.ts src/features/pqcoin/paymentRequest.test.ts src/ui/views/financeUtils.test.ts src/ui/views/paymentCurrency.test.ts --maxWorkers=2
npm --prefix web run typecheck
(cd org-worker && node --import tsx --test test/pqcoin.test.ts)
npm --prefix org-worker run typecheck
```

From the workspace root, with the portal frontend served by local Docker:

```bash
python3 pqcoin/tests/wallet_network.py --browser
```

This test uses synthetic keys/accounts on fresh private node homes. It routes the
local browser's QCash API requests to the actual Worker adapter on loopback, backed
by the real native gateway and two native peers; responses/signatures are not
mocked. The rest of the page is served by the existing local Docker portal. It
checks backup creation/import, QR requests, review/sign/broadcast, observed balances,
wrong-network rejection, mobile overflow and Dena selection. It also exercises
two independent wallet contexts, QR-image and pasted-link import, backup-file
verification, wrong-password rejection, receipt downloads, connection loss and
recovery of a funded recipient wallet after reload. Native checks include
invalid signatures, insufficient funds, duplicate retransmission, gossip, mining,
reorganization and confirmed-history reconstruction after restart. Repeat native
checks with `PQCOIN_POW_BINARY` pointing at the sanitizer binary.

The profile-link feature adds a separate, expiring primary-only identity binding
store (migration 0130, reviewed separately before production). The chain adapter
itself adds no portal balance database. Wallet session buffers and polling
state are ephemeral. Backup retention/deletion is controlled by the user on their
computer. Signed transfers become public chain records retained by participating
nodes, with no transaction erasure mechanism. Test homes and synthetic encrypted
backups remain under ignored `pqcoin/.deps/wallet-network-*` for debugging; remove
those stopped test directories when no longer needed. Reports under
`pqcoin/artifacts/pow/wallet-network-report*.json` contain public test addresses,
transaction IDs and test-directory paths, never seeds/passwords. A node transport
key remains in its private home. Do not publish private homes or PEM files.

The chain remains experimental. The existing consensus, resource-growth and
independent-audit findings in `pqcoin/SECURITY_REVIEW.md` still apply. Prior audit
archives describe their own manifest snapshots, not these later wallet additions.


## Rename compatibility

The product is now **QCash**. New payment links use `currency=QCash`, the canonical
portal API is `/api/qcash`, and the native executable is `qcash`. Legacy `PQT`
payment links, `/api/pqcoin` endpoints, `PQCOIN_*` configuration variables and
`pqcoin-pow` remain compatibility aliases. `QCASH_*` configuration wins when both
forms are set. Existing transaction domains, chain IDs, key derivation, encrypted
backup format identifiers and on-disk data do not change. Old gateway network
labels are normalized at the portal adapter. Internal paths/namespaces retain
`pqcoin` for compatibility; this is not a new chain or a coin conversion.
