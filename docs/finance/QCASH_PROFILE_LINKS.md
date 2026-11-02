# QCash verified profile wallet links

Status: source implemented; tested locally; **production migration and release
not applied**. This is a directory for the experimental chain, not a currency
conversion, escrow or new spending authority for portal administrators.

## Ownership and payment authorization

A signed-in account can link only its own canonical PIdP user ID. A link request
requires explicit consent to share the wallet through its public profile. The
server creates a random, one-use challenge bound to the validated portal origin,
canonical user ID, configured chain ID, wallet address, current link revision,
ten-minute deadline, 90-day link expiry and sharing consent. The browser checks
those fields and signs a separate `QCash/profile-wallet-link/v1` message with
ML-DSA-65. It does not sign arbitrary server text or a payment transaction.

The primary API verifies address/public-key binding and the signature, then uses
a transactional conditional insert/update and challenge deletion. A stale,
replaced, expired or already-consumed challenge cannot publish/revive a link.
Only one outstanding challenge and one link are stored per account/origin/chain.
A current account session plus proof of the new wallet is required to replace it.
No wallet private key or password reaches the portal. The account namespace is
preserved through the existing live PIdP authentication function; no identity is
inferred from email, names or organization roles.

The directory returns at most ten signed-in search results, only for opted-in,
unexpired links with an enabled public profile on that portal and chain. Names
are not unique: results show profile slug and address, require explicit selection,
and carry a stable canonical recipient ID/revision. The browser verifies the
ownership proof and resolves that ID again at review and immediately before
signing. A removed, private, expired or replaced link stops profile-based signing;
the user must select and review again. Payments still require the spending key.
Unlinking hides the directory entry; it cannot invalidate a known raw address or
erase previous public blockchain transfers.

The directory is a centralized naming convenience, not a decentralized identity
proof or a quantum-secure authentication claim. A compromised portal account can
replace its own profile's directory entry. The displayed name comes from the
current public profile, not from the blockchain. Users can continue to verify and
pay wallet addresses directly without using the directory.

## Migration 0130 review

`org-worker/migrations/0130_qcash_profile_wallets.sql` creates two independent
metadata tables and expiry indexes. Existing balances, Dena tables, transaction
bytes, chain IDs and account permissions are unchanged. Both tables have foreign
keys to the existing immutable profile user ID with `ON DELETE CASCADE`. Both are
excluded from immutable change journals and public organization replication.
Their read/write API requires the primary portal; a read replica cannot register
links or serve a stale private directory. Missing tables fail closed with a 503
so application code can be released before the separately reviewed migration.

Review points covered by isolated SQLite tests: ownership checks, one-use proofs,
expiry boundaries, stale revision rejection, cross-user/origin/chain isolation,
profile visibility, unlink/deletion, exclusion registration and bounded retention.
The feature uses parameterized SQL; no client supplies a user ID for mutation.
There is no production backfill. Deploying the candidate still needs explicit
schema review through the normal release process; application rollback alone
will not undo a migration. A rollback can leave these isolated tables unused or,
after reviewed export/deletion decisions, drop just these two new tables and
remove their exclusion entries. No monetary ledger rollback is involved.

## Privacy and retention

The link table contains canonical account ID, portal origin, chain ID, public
wallet address, revision, public key, ownership signature/message, verification
time and expiry. It contains no email, copied profile name, password or private
key. Name/slug are joined from the current profile only while visible. An owner
can remove their link in the wallet UI without possessing the spending key; a
valid account session authorizes deletion of that account's metadata only.
Profile deletion cascades to both tables. Verified account erasure must include
these tables by canonical `user_id`, following the existing manual account-erasure
process; no new complete cross-service erasure workflow is claimed.

Challenges expire in ten minutes, links in 90 days from challenge creation.
Queries exclude expired records immediately. The existing retention cron now
removes at most 500 expired rows per table per run; tests cover dry-run, exact
expiry boundaries and backlog draining. Deployment and scheduled execution still
need operational verification before claiming live enforcement. Neither table
is copied to public replicas, immutable journals, notifications or new exports.

Backups may retain deleted identity bindings. **Before enabling the directory
against a restored database, clear both QCash metadata tables and require fresh
user-authorized links.** This avoids resurrecting a revoked/replaced wallet from
an older snapshot, even if its original signature remains valid. Do not restore
old private directory exports. This restore rule does not erase the public chain;
public transfers and recipient-held addresses remain outside portal deletion.
User-controlled encrypted wallet backup files retain the existing user-managed
lifecycle. Unlinking a profile does not destroy the user's wallet or funds.

## Local acceptance

```bash
(cd org-worker && node --import tsx --test test/qcashWalletLinks.test.ts test/pqcoin.test.ts test/retention.test.ts)
npm --prefix web test -- src/features/pqcoin/wallet.test.ts src/ui/views/paymentCurrency.test.ts src/ui/views/financeUtils.test.ts --maxWorkers=2
npm --prefix web run typecheck
npm --prefix org-worker run typecheck
# From the workspace root, using the local Docker frontend/PIdP installation:
python3 pqcoin/tests/qcash_profiles.py
```

The browser test starts a separate PIdP process and a fresh, uniquely named local
PostgreSQL fixture database inside the existing development Docker deployment.
It creates an isolated website namespace and two dummy website-user accounts;
it does not substitute owner accounts for portal users. A synthetic bootstrap
owner is used only to register that dummy website. The fixture disables email
verification (there is no outbound email delivery) and uses separate signing
secrets; it does not test email ownership or change the running portal's identity
configuration. Real PIdP sessions, `/auth/me`, wallet signatures and native coins
are used. The profile database is isolated SQLite using the actual migration.
The frontend is served by local Docker; only test request destinations are routed
to these isolated local services. The test checks successful linking/send by name,
revocation after review blocking signing, re-link selection, unlink visibility,
and desktop/mobile layout. Its dedicated identity database is dropped on exit.
No production records or organization replicas are written.
