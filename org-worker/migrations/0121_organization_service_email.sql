-- Private service mailbox routing and member-authored correspondence.
CREATE TABLE support_mailboxes (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 address TEXT NOT NULL UNIQUE
);
INSERT INTO support_mailboxes(organization_id,address)
 SELECT id,'service@lifetech.fyi' FROM organizations WHERE id='ef646755-9443-4c7b-ba4b-a7a29754f666';
ALTER TABLE support_tickets ADD COLUMN created_by_user_id TEXT;
ALTER TABLE support_messages ADD COLUMN message_id TEXT;
CREATE INDEX support_ticket_author ON support_tickets(organization_id,created_by_user_id);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('support_mailboxes','Private organization service mailbox routing configuration.');
