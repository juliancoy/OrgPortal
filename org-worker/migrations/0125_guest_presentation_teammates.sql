ALTER TABLE event_guest_presentations ADD COLUMN teammate_email TEXT;
ALTER TABLE event_guest_presentations ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE event_guest_presentations ADD COLUMN teammate_invitation_id TEXT REFERENCES organization_invitations(id) ON DELETE SET NULL;
