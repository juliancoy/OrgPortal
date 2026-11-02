-- Private, primary-only identity bindings. Production application needs separate review.
CREATE TABLE qcash_wallet_links (
  portal_origin TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user_contact_pages(user_id) ON DELETE CASCADE,
  chain_id TEXT NOT NULL,
  address TEXT NOT NULL,
  revision TEXT NOT NULL,
  public_key TEXT NOT NULL,
  signature TEXT NOT NULL,
  proof_message TEXT NOT NULL,
  linked_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(portal_origin,user_id,chain_id)
);
CREATE INDEX qcash_wallet_link_expiry ON qcash_wallet_links(expires_at);
CREATE TABLE qcash_wallet_challenges (
  portal_origin TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user_contact_pages(user_id) ON DELETE CASCADE,
  chain_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  message TEXT NOT NULL,
  expected_revision TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  link_expires_at INTEGER NOT NULL,
  PRIMARY KEY(portal_origin,user_id,chain_id)
);
CREATE INDEX qcash_wallet_challenge_expiry ON qcash_wallet_challenges(expires_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('qcash_wallet_links','Opt-in wallet identity binding, primary-only, owner deletion/90-day expiry, excluded from replicas and immutable journals'),
 ('qcash_wallet_challenges','Private one-use wallet ownership challenge, ten-minute expiry, excluded from replicas and immutable journals');
