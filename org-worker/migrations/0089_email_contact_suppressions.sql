-- Recipient-address preferences belong to a mailing organization, not an entire
-- recipient organization. No account or membership is inferred from an address.
CREATE TABLE email_contact_suppressions (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK(email = lower(trim(email))),
  source TEXT NOT NULL DEFAULT 'recipient-unsubscribe',
  unsubscribed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(organization_id,email)
);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('email_contact_suppressions','private address-level opt-outs; retained while mailing group exists; explicit erasure and re-consent workflow; excluded from public replicas and immutable journals');
