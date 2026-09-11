-- Private source snapshots. Nothing becomes spendable until an approved claim
-- links an imported account to an authenticated identity in this community.
CREATE TABLE timebank_import_batches (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES timebank_communities(id),
  source_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  expected_accounts INTEGER NOT NULL CHECK(expected_accounts > 0),
  expected_records INTEGER NOT NULL CHECK(expected_records >= 0),
  expected_links INTEGER NOT NULL CHECK(expected_links >= 0),
  expected_assets INTEGER NOT NULL DEFAULT 0 CHECK(expected_assets >= 0),
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0, 1)),
  UNIQUE(community_id, source_key),
  UNIQUE(id, community_id)
);
CREATE TRIGGER timebank_import_snapshot_immutable BEFORE UPDATE ON timebank_import_batches
WHEN OLD.id <> NEW.id OR OLD.source_key <> NEW.source_key OR OLD.source_name <> NEW.source_name
  OR OLD.source_url <> NEW.source_url OR OLD.captured_at <> NEW.captured_at OR OLD.imported_at <> NEW.imported_at
  OR OLD.source_sha256 <> NEW.source_sha256 OR OLD.community_id <> NEW.community_id
  OR OLD.expected_accounts <> NEW.expected_accounts OR OLD.expected_records <> NEW.expected_records
  OR OLD.expected_links <> NEW.expected_links OR OLD.expected_assets <> NEW.expected_assets
  OR (OLD.ready = 1 AND NEW.ready <> 1)
BEGIN SELECT RAISE(ABORT, 'Import snapshot differs from the existing batch'); END;

CREATE TABLE timebank_import_accounts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  source_profile_url TEXT NOT NULL,
  source_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  balance_minutes INTEGER,
  earned_minutes INTEGER,
  spent_minutes INTEGER,
  received_minutes INTEGER,
  donated_minutes INTEGER,
  profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  claimed_by_user_id TEXT REFERENCES timebank_members(user_id),
  claimed_at TEXT,
  FOREIGN KEY(batch_id, community_id) REFERENCES timebank_import_batches(id, community_id),
  UNIQUE(batch_id, source_profile_url),
  UNIQUE(community_id, claimed_by_user_id),
  UNIQUE(id, batch_id),
  UNIQUE(id, community_id),
  CHECK((claimed_by_user_id IS NULL) = (claimed_at IS NULL))
);
CREATE TABLE timebank_import_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES timebank_import_batches(id),
  kind TEXT NOT NULL CHECK(kind IN ('activity', 'transaction')),
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  UNIQUE(batch_id, kind, source_url),
  UNIQUE(id, batch_id)
);
CREATE TABLE timebank_import_record_accounts (
  record_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK(relationship IN ('owner', 'provider', 'recipient', 'source_account')),
  PRIMARY KEY(record_id, account_id),
  FOREIGN KEY(record_id, batch_id) REFERENCES timebank_import_records(id, batch_id),
  FOREIGN KEY(account_id, batch_id) REFERENCES timebank_import_accounts(id, batch_id)
);
CREATE TABLE timebank_import_assets (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES timebank_import_batches(id),
  source_url TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK(byte_size > 0),
  sha256 TEXT NOT NULL,
  UNIQUE(batch_id, source_url)
);
CREATE TRIGGER timebank_import_complete BEFORE UPDATE OF ready ON timebank_import_batches
WHEN NEW.ready = 1 AND (
  NEW.expected_accounts <> (SELECT COUNT(*) FROM timebank_import_accounts WHERE batch_id = NEW.id)
  OR NEW.expected_records <> (SELECT COUNT(*) FROM timebank_import_records WHERE batch_id = NEW.id)
  OR NEW.expected_links <> (SELECT COUNT(*) FROM timebank_import_record_accounts WHERE batch_id = NEW.id)
  OR NEW.expected_assets <> (SELECT COUNT(*) FROM timebank_import_assets WHERE batch_id = NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'Import is incomplete'); END;

CREATE TABLE timebank_import_claims (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  claimant_user_id TEXT NOT NULL REFERENCES timebank_members(user_id),
  claimant_name TEXT NOT NULL,
  claimant_email TEXT NOT NULL,
  evidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_user_id TEXT,
  review_note TEXT,
  FOREIGN KEY(account_id, community_id) REFERENCES timebank_import_accounts(id, community_id),
  CHECK((status = 'pending' AND reviewed_at IS NULL AND reviewer_user_id IS NULL)
    OR (status <> 'pending' AND reviewed_at IS NOT NULL AND reviewer_user_id IS NOT NULL))
);
CREATE UNIQUE INDEX timebank_import_one_pending_claim ON timebank_import_claims(community_id, claimant_user_id) WHERE status = 'pending';
CREATE UNIQUE INDEX timebank_import_one_approved_claim ON timebank_import_claims(account_id) WHERE status = 'approved';
CREATE INDEX timebank_import_claim_review ON timebank_import_claims(community_id, status, created_at);
CREATE TABLE timebank_import_claim_audit (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES timebank_import_claims(id),
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER timebank_import_audit_no_update BEFORE UPDATE ON timebank_import_claim_audit
BEGIN SELECT RAISE(ABORT, 'Claim audit is append-only'); END;
CREATE TRIGGER timebank_import_audit_no_delete BEFORE DELETE ON timebank_import_claim_audit
BEGIN SELECT RAISE(ABORT, 'Claim audit is append-only'); END;
CREATE TRIGGER timebank_import_claim_guard BEFORE INSERT ON timebank_import_claims
WHEN NEW.status <> 'pending' OR NOT EXISTS (
  SELECT 1 FROM timebank_import_accounts a JOIN timebank_import_batches b ON b.id = a.batch_id
  WHERE a.id = NEW.account_id AND a.community_id = NEW.community_id AND b.ready = 1 AND a.claimed_by_user_id IS NULL
) OR EXISTS (
  SELECT 1 FROM timebank_import_accounts WHERE community_id = NEW.community_id AND claimed_by_user_id = NEW.claimant_user_id
)
BEGIN SELECT RAISE(ABORT, 'Imported account is not available to claim'); END;
CREATE TRIGGER timebank_import_claim_immutable BEFORE UPDATE ON timebank_import_claims
WHEN OLD.status <> 'pending' OR NEW.id <> OLD.id OR NEW.account_id <> OLD.account_id
  OR NEW.community_id <> OLD.community_id OR NEW.claimant_user_id <> OLD.claimant_user_id
  OR NEW.evidence <> OLD.evidence OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT, 'Resolved claim is immutable'); END;
CREATE TRIGGER timebank_import_claim_requested AFTER INSERT ON timebank_import_claims
BEGIN
  INSERT INTO timebank_import_claim_audit VALUES (NEW.id || ':requested', NEW.id, NEW.claimant_user_id, 'requested', NEW.evidence, NEW.created_at);
END;
CREATE TRIGGER timebank_import_claim_approved AFTER UPDATE OF status ON timebank_import_claims
WHEN NEW.status = 'approved'
BEGIN
  UPDATE timebank_import_accounts SET claimed_by_user_id = NEW.claimant_user_id, claimed_at = NEW.reviewed_at
    WHERE id = NEW.account_id AND claimed_by_user_id IS NULL;
  SELECT RAISE(ABORT, 'Imported account already claimed') WHERE changes() <> 1;
  UPDATE timebank_import_claims SET status = 'rejected', reviewed_at = NEW.reviewed_at,
    reviewer_user_id = NEW.reviewer_user_id, review_note = 'Another claim for this account was approved.'
    WHERE account_id = NEW.account_id AND id <> NEW.id AND status = 'pending';
END;
CREATE TRIGGER timebank_import_claim_resolved AFTER UPDATE OF status ON timebank_import_claims
WHEN NEW.status <> 'pending'
BEGIN
  INSERT INTO timebank_import_claim_audit VALUES (NEW.id || ':' || NEW.status, NEW.id, NEW.reviewer_user_id, NEW.status, COALESCE(NEW.review_note, ''), NEW.reviewed_at);
END;

-- Ready snapshots cannot be edited, extended or removed through later imports.
CREATE TRIGGER timebank_import_account_source_immutable BEFORE UPDATE ON timebank_import_accounts
WHEN OLD.id <> NEW.id OR OLD.batch_id <> NEW.batch_id OR OLD.community_id <> NEW.community_id
 OR OLD.source_profile_url <> NEW.source_profile_url OR OLD.source_slug <> NEW.source_slug OR OLD.name <> NEW.name
 OR OLD.balance_minutes IS NOT NEW.balance_minutes OR OLD.earned_minutes IS NOT NEW.earned_minutes
 OR OLD.spent_minutes IS NOT NEW.spent_minutes OR OLD.received_minutes IS NOT NEW.received_minutes
 OR OLD.donated_minutes IS NOT NEW.donated_minutes OR OLD.profile_json <> NEW.profile_json
BEGIN SELECT RAISE(ABORT, 'Imported source account is immutable'); END;
CREATE TRIGGER timebank_import_accounts_insert_guard BEFORE INSERT ON timebank_import_accounts
WHEN (SELECT ready FROM timebank_import_batches WHERE id = NEW.batch_id) = 1
BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
CREATE TRIGGER timebank_import_accounts_delete_guard BEFORE DELETE ON timebank_import_accounts
WHEN (SELECT ready FROM timebank_import_batches WHERE id = OLD.batch_id) = 1
BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
CREATE TRIGGER timebank_import_records_insert_guard BEFORE INSERT ON timebank_import_records
WHEN (SELECT ready FROM timebank_import_batches WHERE id = NEW.batch_id) = 1
BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
CREATE TRIGGER timebank_import_records_delete_guard BEFORE DELETE ON timebank_import_records
WHEN (SELECT ready FROM timebank_import_batches WHERE id = OLD.batch_id) = 1
BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
CREATE TRIGGER timebank_import_records_update_guard BEFORE UPDATE ON timebank_import_records
BEGIN SELECT RAISE(ABORT, 'Imported source is immutable'); END;
CREATE TRIGGER timebank_import_record_accounts_insert_guard BEFORE INSERT ON timebank_import_record_accounts
WHEN (SELECT ready FROM timebank_import_batches WHERE id = NEW.batch_id) = 1
BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
CREATE TRIGGER timebank_import_record_accounts_delete_guard BEFORE DELETE ON timebank_import_record_accounts
WHEN (SELECT ready FROM timebank_import_batches WHERE id = OLD.batch_id) = 1
BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
CREATE TRIGGER timebank_import_record_accounts_update_guard BEFORE UPDATE ON timebank_import_record_accounts
BEGIN SELECT RAISE(ABORT, 'Imported source is immutable'); END;
CREATE TRIGGER timebank_import_assets_insert_guard BEFORE INSERT ON timebank_import_assets
WHEN (SELECT ready FROM timebank_import_batches WHERE id = NEW.batch_id) = 1
BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
CREATE TRIGGER timebank_import_assets_delete_guard BEFORE DELETE ON timebank_import_assets
WHEN (SELECT ready FROM timebank_import_batches WHERE id = OLD.batch_id) = 1
BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
CREATE TRIGGER timebank_import_assets_update_guard BEFORE UPDATE ON timebank_import_assets
BEGIN SELECT RAISE(ABORT, 'Imported source is immutable'); END;
CREATE TRIGGER timebank_import_batch_delete_guard BEFORE DELETE ON timebank_import_batches
WHEN OLD.ready = 1 BEGIN SELECT RAISE(ABORT, 'Ready import snapshot is immutable'); END;
