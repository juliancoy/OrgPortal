-- Private archival receipt, retained with its invitation. It is deliberately not
-- a foreign key: deleting correspondence must not clear this receipt and cause
-- the cron to recreate a conversation the user deleted.
ALTER TABLE organization_invitations ADD COLUMN email_archive_ticket_id TEXT;
