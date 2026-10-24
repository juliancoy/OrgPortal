-- Private service mail. Excluded from public replication and the public journal.
CREATE TABLE support_tickets (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 sender_email TEXT NOT NULL, subject TEXT NOT NULL, category TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','closed')),
 assigned_user_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX support_ticket_queue ON support_tickets(organization_id,status,updated_at);
CREATE INDEX support_ticket_expiry ON support_tickets(expires_at);
CREATE TRIGGER support_ticket_delete_notifications BEFORE DELETE ON support_tickets
 BEGIN DELETE FROM user_notifications WHERE type='support_ticket' AND entity_id=OLD.id; END;
CREATE TABLE support_messages (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 dedupe_key TEXT UNIQUE, direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
 body TEXT NOT NULL, author_id TEXT, faq_id TEXT, delivery TEXT NOT NULL DEFAULT 'received',
 created_at TEXT NOT NULL
);
CREATE INDEX support_message_ticket ON support_messages(ticket_id,created_at);
CREATE TABLE support_faqs (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 question TEXT NOT NULL, answer TEXT NOT NULL, source_url TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), reviewed_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(organization_id,question)
);
CREATE TABLE support_routes (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, category TEXT NOT NULL,
 assigned_user_id TEXT NOT NULL, PRIMARY KEY(organization_id,category)
);
INSERT INTO support_faqs(id,organization_id,question,answer,source_url,reviewed_by,updated_at)
 SELECT 'lifetech-bylaws',id,'Where can I read the LifeTech bylaws?',
 'Read the LifeTech Constitution and Bylaws, including its current draft or ratification status, at https://lifetech.fyi/governance/documents/lifetech-constitution .',
 'https://lifetech.fyi/governance/documents/lifetech-constitution','system:canonical-resource',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM organizations WHERE slug='lifetech';
INSERT INTO support_faqs(id,organization_id,question,answer,source_url,reviewed_by,updated_at)
 SELECT 'lifetech-availability',id,'Where can I set my meeting availability?',
 'Sign in to LifeTech and set your meeting availability at https://lifetech.fyi/availability .',
 'https://lifetech.fyi/availability','system:canonical-resource',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM organizations WHERE slug='lifetech';
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('support_tickets','Private inbound support email; 90 days after activity; organization-admin access only.'),
 ('support_messages','Private support correspondence, cascade-deleted with its ticket.'),
 ('support_faqs','Organization-reviewed support configuration; not public replication.'),
 ('support_routes','Private support assignment configuration.');
